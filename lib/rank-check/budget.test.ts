import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), groupBy: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import {
  assertBudgetAvailable,
  BudgetExhaustedError,
  DEFAULT_MONTHLY_COST_CAP_CENTS,
  isBudgetExhaustedError,
  monthlyLookupSpendByConnection,
  monthlySpendCents,
  monthStartUtc,
  projectBudgetCapCents,
} from "./budget";

function mockOwnBudgetSpend(costCents: number) {
  mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([
    {
      _count: { _all: 1, priceCents: 0 },
      _sum: { costCents: String(costCents), priceCents: null },
      credentialSource: "own",
    },
  ]);
}

describe("projectBudgetCapCents", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the per-workspace budget cap column", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 12_300 });

    await expect(projectBudgetCapCents("project_1")).resolves.toBe(12_300);

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { budgetCapCents: true },
      where: { id: "project_1" },
    });
  });

  it("falls back to the default cap when the project is missing", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    expect(DEFAULT_MONTHLY_COST_CAP_CENTS).toBe(5_000);
    await expect(projectBudgetCapCents("project_missing")).resolves.toBe(
      DEFAULT_MONTHLY_COST_CAP_CENTS,
    );
  });
});

describe("rank check budget", () => {
  beforeEach(() => {
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 10 });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: null } });
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([]);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: null } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("computes month start in UTC", () => {
    expect(monthStartUtc(new Date("2026-07-31T23:59:59.999Z"))).toEqual(
      new Date("2026-07-01T00:00:00.000Z"),
    );
  });

  it("reads confirmed monthly spend from the ledger without rank-check actuals or estimates", async () => {
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: "42.1250" },
    });

    await expect(
      monthlySpendCents("project_1", new Date("2026-07-14T12:00:00.000Z")),
    ).resolves.toBe(42.125);

    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true },
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
  });

  it("keeps a confirmed cents fraction unaffected by rank-check estimates", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 100, estimatedCostCents: 40 },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: "1.7500" },
    });

    await expect(
      monthlySpendCents("project_1", new Date("2026-07-14T12:00:00.000Z")),
    ).resolves.toBe(1.75);

    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
  });

  it("sums every ledger feature including rank checks and reads no keyword join", async () => {
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: "1.2000" },
    });

    await expect(
      monthlySpendCents("project_1", new Date("2026-07-29T12:00:00.000Z")),
    ).resolves.toBe(1.2);

    const where = mocks.prisma.providerCostEntry.aggregate.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where).not.toHaveProperty("feature");
    expect(where).not.toHaveProperty("keyword");
    expect(where).not.toHaveProperty("keywordId");
  });

  it("returns zero when no monthly spend exists", async () => {
    await expect(monthlySpendCents("project_1")).resolves.toBe(0);

    expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
  });

  it("groups uncached monthly lookup spend by connection and feature", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([
      {
        _count: { _all: 2 },
        _sum: { costCents: "1.5000" },
        connectionId: "conn_1",
        feature: "keyword_research",
      },
      {
        _count: { _all: 1 },
        _sum: { costCents: null },
        connectionId: "conn_2",
        feature: "keyword_metrics",
      },
    ]);

    await expect(
      monthlyLookupSpendByConnection("project_1", new Date("2026-07-14T12:00:00.000Z")),
    ).resolves.toEqual([
      { connectionId: "conn_1", costCents: 1.5, entryCount: 2, feature: "keyword_research" },
      { connectionId: "conn_2", costCents: 0, entryCount: 1, feature: "keyword_metrics" },
    ]);

    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { costCents: true },
      by: ["connectionId", "feature"],
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        feature: { not: "rank_check" },
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
  });

  it("values a mixed monthly ledger with one bounded credential-source aggregate", async () => {
    mocks.prisma.providerCostEntry.groupBy.mockResolvedValue([
      {
        _count: { _all: 2, priceCents: 0 },
        _sum: { costCents: "2.5000", priceCents: null },
        credentialSource: "own",
      },
      {
        _count: { _all: 1, priceCents: 1 },
        _sum: { costCents: "1.0000", priceCents: "6.5000" },
        credentialSource: "hosted",
      },
    ]);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 1,
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9 });
    expect(mocks.prisma.providerCostEntry.aggregate).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.groupBy).toHaveBeenCalledWith({
      _count: { _all: true, priceCents: true },
      _sum: { costCents: true, priceCents: true },
      by: ["credentialSource"],
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
  });

  it("allows checks while spend is below the monthly cap", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(assertBudgetAvailable("project_1")).resolves.toEqual({
      capCents: 10,
      spentCents: 9.5,
    });
  });

  it("treats a zero legacy cap as no cap when enforcing a rank-check launch", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 0 });
    mockOwnBudgetSpend(25);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 25,
      }),
    ).resolves.toEqual({ capCents: 0, spentCents: 25 });
  });

  it("skips the cap query when a precomputed cap is provided", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), { capCents: 20 }),
    ).resolves.toEqual({ capCents: 20, spentCents: 9.5 });

    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("enforces a provided precomputed cap", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), { capCents: 9 }),
    ).rejects.toMatchObject({
      budget: { capCents: 9, projectId: "project_1", spentCents: 9.5 },
      code: "budget_exhausted",
    });

    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the cap query when the provided cap is not finite", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        capCents: Number.NaN,
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9.5 });

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects when spend plus the current check estimate would exceed the monthly cap", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 0.75,
      }),
    ).rejects.toMatchObject({
      budget: { capCents: 10, projectId: "project_1", spentCents: 9.5 },
      code: "budget_exhausted",
    });
  });

  it("allows a current check estimate that exactly fills the remaining cap", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 0.5,
      }),
    ).resolves.toEqual({
      capCents: 10,
      spentCents: 9.5,
    });
  });

  it("throws a typed budget error when spend reaches the monthly cap", async () => {
    mockOwnBudgetSpend(10);

    const promise = assertBudgetAvailable("project_1");

    await expect(promise).rejects.toBeInstanceOf(BudgetExhaustedError);
    await promise.catch((error: BudgetExhaustedError) => {
      expect(error.code).toBe("budget_exhausted");
      expect(error.status).toBe(429);
      expect(error.budget).toEqual({ capCents: 10, projectId: "project_1", spentCents: 10 });
      expect(isBudgetExhaustedError(error)).toBe(true);
    });
  });

  it("blocks another check once running reservations bring spend to the cap", async () => {
    mockOwnBudgetSpend(9);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: 1 } });

    await expect(assertBudgetAvailable("project_1")).rejects.toMatchObject({
      budget: { capCents: 10, projectId: "project_1", reservedCents: 1, spentCents: 9 },
      code: "budget_exhausted",
    });
    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { estimatedCostCents: true },
        where: expect.objectContaining({ status: "running" }),
      }),
    );
  });

  it("does not represent an estimated reservation as actual spend", async () => {
    mockOwnBudgetSpend(8);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: 1 } });

    const state = await assertBudgetAvailable("project_1");

    expect(state.spentCents).toBe(8);
    expect(state.reservedCents).toBe(1);
  });

  it("does not reserve estimates retained on completed checks", async () => {
    mockOwnBudgetSpend(9);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: null } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 1,
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9 });
  });

  it("reports admitted running reservations separately from confirmed spend", async () => {
    mockOwnBudgetSpend(8);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: 1 } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 1,
      }),
    ).resolves.toEqual({ capCents: 10, reservedCents: 1, spentCents: 8 });
  });

  it("keeps running reservations in admission alongside the next check estimate", async () => {
    mockOwnBudgetSpend(8);
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { estimatedCostCents: 1.5 } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        estimatedCostCents: 1,
      }),
    ).rejects.toMatchObject({
      budget: { reservedCents: 1.5, spentCents: 8 },
      code: "budget_exhausted",
    });
  });

  it("excludes a running reservation by rank-check id without carving the ledger sum", async () => {
    mockOwnBudgetSpend(9.5);

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        excludeRankCheckId: "rank_running_1",
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9.5 });

    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { estimatedCostCents: true },
        where: expect.objectContaining({ id: { not: "rank_running_1" }, status: "running" }),
      }),
    );
    const spendWhere = mocks.prisma.providerCostEntry.groupBy.mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(spendWhere).not.toHaveProperty("id");
  });
});
