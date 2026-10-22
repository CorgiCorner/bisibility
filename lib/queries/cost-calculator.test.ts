import { beforeEach, describe, expect, it, vi } from "vitest";
import { frozenUsageResponse } from "./canonical-query.test-fixture";
import { getCalculatorPrefill, getProjectCostContext } from "./cost-calculator";

const mocks = vi.hoisted(() => ({
  budgetCap: vi.fn().mockResolvedValue(777),
  budgetStatus: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    keyword: { groupBy: vi.fn(), findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
  project: {
    monthlyCapCents: 900,
    domain: "https://www.example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/metering/project-budget-read", () => ({
  projectBudgetCapCents: mocks.budgetCap,
  projectBudgetStatus: mocks.budgetStatus,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("cost calculator query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockImplementation((query) =>
      frozenUsageResponse(query, mocks.prisma.providerCostEntry),
    );
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
    mocks.budgetStatus.mockResolvedValue({
      budget: {
        id: "project:project_1:monthly",
        limit: { value: 777n, scale: 0, unit: "budget_cents" },
      },
      used: { value: 1n, scale: 0, unit: "budget_cents" },
      reserved: { value: 0n, scale: 0, unit: "budget_cents" },
      uncertain: false,
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 0, estimatedCostCents: 0 },
    });
  });

  it("prefills counts, frequency, and primary provider cost from project data", async () => {
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 7 }, device: "desktop", locationId: "loc_1" },
      { _count: { _all: 5 }, device: "mobile", locationId: "loc_2" },
    ]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      serpDepth: 50,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { checkSchedule: { enabled: true, archivedAt: null, frequency: "weekly" } },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "own",
      rates: [{ feature: "rank_check", amountCents: "0.06" }],
      provider: "dataforseo",
    });

    const result = await getCalculatorPrefill("prj_1");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.keyword.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["locationId", "device"],
      where: { projectId: "project_1", archivedAt: null },
    });
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: {
        credentialSource: true,
        id: true,
        provider: true,
        rates: { select: { amountCents: true, feature: true }, where: { feature: "rank_check" } },
      },
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", archivedAt: null } }),
    );
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
    expect(result).toEqual({
      costPerCheckCents: 0.06,
      depth: 50,
      deviceCount: 2,
      devices: ["desktop", "mobile"],
      frequency: "weekly",
      keywordCount: 12,
      locationCount: 2,
      projectName: "Example",
      providerId: "dataforseo",
    });
  });

  it("keeps empty projects usable with minimum location and device counts", async () => {
    const result = await getCalculatorPrefill("prj_1");

    expect(result).toEqual({
      costPerCheckCents: null,
      depth: 100,
      deviceCount: 1,
      devices: [],
      frequency: "monthly",
      keywordCount: 0,
      locationCount: 1,
      projectName: "Example",
      providerId: null,
    });
  });

  it("exposes mobile-only tracked devices for calculator defaults", async () => {
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 1 }, device: "mobile", locationId: "loc_1" },
    ]);

    const result = await getCalculatorPrefill("prj_1");

    expect(result).toMatchObject({
      deviceCount: 1,
      devices: ["mobile"],
    });
  });

  it("uses the calculator monthly what-if fallback for unassigned targets despite daily defaults", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ frequency: "daily" });

    const result = await getCalculatorPrefill("prj_1");

    expect(result.frequency).toBe("monthly");
  });

  it("does not claim one recurring cadence for mixed or paused membership cohorts", async () => {
    for (const memberships of [
      [{ checkSchedule: null }],
      [
        { checkSchedule: { enabled: true, archivedAt: null, frequency: "daily" } },
        { checkSchedule: null },
      ],
      [{ checkSchedule: { enabled: false, archivedAt: null, frequency: "daily" } }],
    ]) {
      mocks.prisma.keyword.findMany.mockResolvedValue(memberships);
      expect((await getCalculatorPrefill("prj_1")).frequency).toBe("monthly");
      expect((await getProjectCostContext("prj_1")).rawFrequency).toBe("manual");
    }
  });
  it("preserves an explicit zero-cost provider rate", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "own",
      rates: [{ feature: "rank_check", amountCents: "0" }],
      provider: "local-sequence",
    });

    const result = await getCalculatorPrefill("prj_1");

    expect(result).toMatchObject({
      costPerCheckCents: 0,
      providerId: "local-sequence",
    });
  });

  it("keeps new-target defaults manual while preserving confirmed ledger spend", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      cronExpression: "0 6 * * 1",
      frequency: "custom_cron",
      serpDepth: 50,
      timezone: "America/New_York",
    });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 100, estimatedCostCents: 25 },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 75 } });

    await expect(getProjectCostContext("prj_1")).resolves.toMatchObject({
      capCents: 777,
      cronExpression: null,
      rawFrequency: "manual",
      spentCents: 75,
      timezone: "UTC",
    });
    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
  });

  it("uses the funding budget spend for a split project", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "hosted",
      id: "hosted_1",
      provider: "serpapi",
      rates: [],
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 75 } });
    mocks.budgetStatus.mockResolvedValue({
      budget: {
        id: "credits-project:project_1:monthly",
        limit: { value: 40n, scale: 0, unit: "customer_cents" },
      },
      used: { value: 12n, scale: 0, unit: "customer_cents" },
      reserved: { value: 0n, scale: 0, unit: "customer_cents" },
      uncertain: false,
    });

    await expect(getProjectCostContext("prj_1")).resolves.toMatchObject({
      capCents: 40,
      spentCents: 12,
    });
  });
});
