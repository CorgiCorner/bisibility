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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("computes month start in UTC", () => {
    expect(monthStartUtc(new Date("2026-07-31T23:59:59.999Z"))).toEqual(
      new Date("2026-07-01T00:00:00.000Z"),
    );
  });

  it("aggregates completed spend and running reservations for the current UTC calendar month", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: "42.1250", estimatedCostCents: "1.0000" },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: "2.5000" },
    });

    await expect(
      monthlySpendCents("project_1", new Date("2026-07-14T12:00:00.000Z")),
    ).resolves.toBe(45.625);

    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true, estimatedCostCents: true },
      where: {
        checkedAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        keyword: { projectId: "project_1" },
        status: { not: "deferred" },
      },
    });
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true },
      where: {
        cached: false,
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        feature: { not: "rank_check" },
        projectId: "project_1",
      },
    });
  });

  it("counts canonical failed rank-check cost without double-counting its evidence entry", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: "1.2000", estimatedCostCents: null },
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _sum: { costCents: null },
    });

    await expect(
      monthlySpendCents("project_1", new Date("2026-07-29T12:00:00.000Z")),
    ).resolves.toBe(1.2);
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feature: { not: "rank_check" } }),
      }),
    );
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
        projectId: "project_1",
      },
    });
  });

  it("returns zero when no monthly spend exists", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: null, estimatedCostCents: null },
    });

    await expect(monthlySpendCents("project_1")).resolves.toBe(0);
  });

  it("allows checks while spend is below the monthly cap", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

    await expect(assertBudgetAvailable("project_1")).resolves.toEqual({
      capCents: 10,
      spentCents: 9.5,
    });
  });

  it("skips the cap query when a precomputed cap is provided", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), { capCents: 20 }),
    ).resolves.toEqual({ capCents: 20, spentCents: 9.5 });

    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("enforces a provided precomputed cap", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), { capCents: 9 }),
    ).rejects.toMatchObject({
      budget: { capCents: 9, projectId: "project_1", spentCents: 9.5 },
      code: "budget_exhausted",
    });

    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the cap query when the provided cap is not finite", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        capCents: Number.NaN,
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9.5 });

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects when spend plus the current check estimate would exceed the monthly cap", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

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
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 9.5 } });

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
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({ _sum: { costCents: 10 } });

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
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 9, estimatedCostCents: 1 },
    });

    await expect(assertBudgetAvailable("project_1")).rejects.toMatchObject({
      budget: { capCents: 10, projectId: "project_1", spentCents: 10 },
      code: "budget_exhausted",
    });
  });

  it("allows completion when excluding the running reservation leaves actual spend below cap", async () => {
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: 9.5, estimatedCostCents: null },
    });

    await expect(
      assertBudgetAvailable("project_1", new Date("2026-07-14T12:00:00.000Z"), {
        excludeRankCheckId: "rank_running_1",
      }),
    ).resolves.toEqual({ capCents: 10, spentCents: 9.5 });

    expect(mocks.prisma.rankCheck.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true, estimatedCostCents: true },
      where: {
        checkedAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lt: new Date("2026-08-01T00:00:00.000Z"),
        },
        id: { not: "rank_running_1" },
        keyword: { projectId: "project_1" },
        status: { not: "deferred" },
      },
    });
  });
});
