import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCheckHealth } from "./check-health";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    providerConnection: {
      findFirst: vi.fn(),
    },
    providerCostEntry: {
      aggregate: vi.fn(),
    },
    rankCheck: {
      aggregate: vi.fn(),
    },
  },
  requireReadableProject: vi.fn(),
  budgetStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/metering/usage-read", () => ({
  monthlySpendCents: async () =>
    Number((await mocks.prisma.providerCostEntry.aggregate())._sum.costCents ?? 0),
}));
vi.mock("@/lib/metering/project-budget-read", () => ({
  projectBudgetCapCents: vi.fn(),
  projectBudgetStatus: mocks.budgetStatus,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

const now = new Date("2026-07-14T12:00:00.000Z");
const project = { budgetCapCents: 500, id: "project_1", publicId: "prj_1" };

describe("check health query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project });
    mocks.budgetStatus.mockImplementation(async () => {
      const cap = (await mocks.requireReadableProject()).project.budgetCapCents;
      return {
        budget: { limit: cap ? { value: BigInt(cap), scale: 0, unit: "budget_cents" } : null },
        reserved: { value: 0n, scale: 0, unit: "budget_cents" },
        uncertain: false,
      };
    });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        failedCount: 0,
        latestCheckedAt: null,
        latestError: null,
        latestErrorCode: null,
        latestKeyword: null,
        latestProvider: null,
        runningCount: 0,
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
  });

  it("treats an explicit zero Store limit as blocked", async () => {
    mocks.budgetStatus.mockResolvedValue({
      budget: { limit: { value: 0n, scale: 0, unit: "budget_cents" } },
      reserved: { value: 0n, scale: 0, unit: "budget_cents" },
      uncertain: false,
    });
    expect((await getCheckHealth("project", { now })).budget.exhausted).toBe(true);
  });
  it("returns budget, failed-check, and running-check state for a readable project", async () => {
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 500 } });
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        failedCount: 2,
        latestCheckedAt: new Date("2026-07-14T11:30:00.000Z"),
        latestError: "Provider request failed.",
        latestErrorCode: "provider_billing",
        latestKeyword: "headless cms",
        latestProvider: "dataforseo",
        runningCount: 1,
      },
    ]);

    const result = await getCheckHealth("prj_1", { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(result).toEqual({
      budget: { capCents: 500, exhausted: true, spentCents: 500 },
      currentFailures: { count: 0, latestCheckId: null },
      failed24h: {
        count: 2,
        latest: {
          checkedAt: "2026-07-14T11:30:00.000Z",
          error: "Provider request failed.",
          errorCode: "provider_billing",
          keyword: "headless cms",
          provider: "dataforseo",
        },
      },
      providerConnected: false,
      providerRate: { overrideCents: null, providerId: null },
      runningCount: 1,
    });
  });

  it("scopes every rank-check read to the authorized project id", async () => {
    await getCheckHealth("prj_1", { now });

    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].join(" ")).toContain('rc."errorCode"');
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      "project_1",
      new Date("2026-07-13T12:00:00.000Z"),
      new Date("2026-07-13T12:00:00.000Z"),
    ]);
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
  });

  it("reports whether a connected SERP provider can run checks", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "own",
      rates: [{ feature: "rank_check", amountCents: "0.25" }],
      id: "provider_1",
      provider: "dataforseo",
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      providerConnected: true,
      providerRate: { overrideCents: 0.25, providerId: "dataforseo" },
    });
  });

  it("preserves an explicit zero-cost provider rate", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "own",
      rates: [{ feature: "rank_check", amountCents: "0" }],
      id: "provider_local",
      provider: "local-sequence",
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      providerConnected: true,
      providerRate: { overrideCents: 0, providerId: "local-sequence" },
    });
  });

  it("does not treat a zero cap as exhausted", async () => {
    mocks.requireReadableProject.mockResolvedValue({
      project: { ...project, budgetCapCents: 0 },
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      budget: { capCents: 0, exhausted: false, spentCents: 0 },
    });
  });

  it("uses the funding budget spend for a split project", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      credentialSource: "hosted",
      id: "hosted_1",
      provider: "serpapi",
      rates: [],
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 500 } });
    mocks.budgetStatus.mockResolvedValue({
      budget: {
        id: "credits-project:project_1:monthly",
        limit: { value: 80n, scale: 0, unit: "customer_cents" },
      },
      used: { value: 10n, scale: 0, unit: "customer_cents" },
      reserved: { value: 0n, scale: 0, unit: "customer_cents" },
      uncertain: false,
    });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      budget: { capCents: 80, exhausted: false, spentCents: 10 },
    });
    expect(mocks.prisma.providerCostEntry.aggregate).not.toHaveBeenCalled();
  });

  it("keeps budget available when monthly spend is below the cap", async () => {
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 125 } });

    await expect(getCheckHealth("prj_1", { now })).resolves.toMatchObject({
      budget: { capCents: 500, exhausted: false, spentCents: 125 },
      failed24h: { count: 0, latest: null },
      runningCount: 0,
    });
  });
});

it.each([
  [null, "budget_missing"],
  [{ budget: { limit: null }, uncertain: true }, "usage_reconciliation_required"],
])("preserves a distinct budget block reason", async (state, reason) => {
  mocks.requireReadableProject.mockResolvedValue({ project });
  mocks.budgetStatus.mockResolvedValue(state);
  mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: 0 } });
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
  expect((await getCheckHealth("project_1", { now })).budget).toMatchObject({
    exhausted: true,
    reason,
  });
});
