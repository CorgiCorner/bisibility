import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCalculatorPrefill, getProjectCostContext } from "./cost-calculator";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    providerCostEntry: { aggregate: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
  project: {
    budgetCapCents: 900,
    domain: "https://www.example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("cost calculator query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
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
      frequency: "weekly",
      serpDepth: 50,
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0.06,
      provider: "dataforseo",
    });

    const result = await getCalculatorPrefill("prj_1");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.keyword.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      by: ["locationId", "device"],
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: { costPerCheckCents: true, id: true, provider: true },
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
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

  it("collapses custom cron defaults to monthly estimates", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({ frequency: "custom_cron" });

    const result = await getCalculatorPrefill("prj_1");

    expect(result.frequency).toBe("monthly");
  });

  it("preserves an explicit zero-cost provider rate", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 0,
      provider: "local-sequence",
    });

    const result = await getCalculatorPrefill("prj_1");

    expect(result).toMatchObject({
      costPerCheckCents: 0,
      providerId: "local-sequence",
    });
  });

  it("returns the raw schedule and cap-enforcement spend context", async () => {
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
      capCents: 900,
      cronExpression: "0 6 * * 1",
      rawFrequency: "custom_cron",
      spentCents: 200,
      timezone: "America/New_York",
    });
  });
});
