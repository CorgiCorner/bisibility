import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rankCheckLedgerActuals: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { rankCheck: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/queries/rank-check-run-accounting", () => ({
  rankCheckLedgerActuals: mocks.rankCheckLedgerActuals,
}));

import { rankCheckAccountingOverride, rankCheckResources } from "./rank-check-accounting";
import type { RankCheckRecord } from "./resources";

function checkRecord(overrides: Record<string, unknown> = {}) {
  return {
    attempts: null,
    billingUnits: 1,
    checkedAt: new Date("2026-09-05T12:00:00.000Z"),
    costCents: 1,
    error: null,
    errorCode: null,
    id: "rank_check_1",
    keyword: { projectId: "project_1", publicId: "kw_a00000000000000000000000" },
    position: 3,
    previousPosition: null,
    provider: "serpapi",
    publicId: "check_a00000000000000000000000",
    rankingUrl: null,
    raw: null,
    run: null,
    status: "completed",
    ...overrides,
  } as unknown as RankCheckRecord;
}

function ledger(overrides: Record<string, unknown> = {}) {
  return {
    costCents: 1.5,
    receiptCount: 3,
    unitProvider: "serpapi",
    unconfirmedCount: 0,
    units: 3,
    ...overrides,
  };
}

describe("rank-check accounting wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rankCheckLedgerActuals.mockResolvedValue(new Map());
  });

  it("does not label another provider's task quantity as searches after a cached fallback", () => {
    expect(
      rankCheckAccountingOverride(
        checkRecord(),
        ledger({ unitProvider: "dataforseo", units: 1, costCents: 0.625 }),
      ),
    ).toEqual({ costCents: 0.625, usageQuantity: null });
  });

  it("reports ledger actuals over stored fields for a quota provider", async () => {
    mocks.rankCheckLedgerActuals.mockResolvedValue(new Map([["rank_check_1", ledger()]]));

    const [resource] = await rankCheckResources("project_1", [checkRecord()]);

    expect(resource).toMatchObject({
      cost_cents: 1.5,
      usage: { quantity: 3, status: "confirmed", unit: "operations" },
    });
    expect(mocks.rankCheckLedgerActuals).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckLedgerActuals).toHaveBeenCalledWith("project_1", ["rank_check_1"]);
  });

  it("keeps fractional metered cost as both cost and cents usage", async () => {
    mocks.rankCheckLedgerActuals.mockResolvedValue(
      new Map([["rank_check_1", ledger({ costCents: 1.25, units: 5 })]]),
    );

    const [resource] = await rankCheckResources("project_1", [
      checkRecord({ provider: "dataforseo" }),
    ]);

    expect(resource).toMatchObject({
      cost_cents: 1.25,
      usage: { quantity: 1.25, status: "confirmed", unit: "cents" },
    });
  });

  it("keeps an unknown receipt null over stored known values", async () => {
    mocks.rankCheckLedgerActuals.mockResolvedValue(
      new Map([
        [
          "rank_check_1",
          ledger({
            costCents: null,
            units: null,
            receiptCount: 2,
            unitProvider: "serpapi",
            unconfirmedCount: 1,
          }),
        ],
      ]),
    );

    const [resource] = await rankCheckResources("project_1", [
      checkRecord({ billingUnits: 3, costCents: 2 }),
    ]);

    expect(resource).toMatchObject({
      cost_cents: null,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });

  it("never sums units across mixed providers", async () => {
    mocks.rankCheckLedgerActuals.mockResolvedValue(
      new Map([["rank_check_1", ledger({ costCents: 1.625, receiptCount: 2, units: null })]]),
    );

    const [resource] = await rankCheckResources("project_1", [checkRecord()]);

    expect(resource).toMatchObject({
      cost_cents: 1.625,
      usage: { quantity: null, status: "unconfirmed", unit: "operations" },
    });
  });

  it("preserves measured legacy fields when the ledger has no receipts", async () => {
    const [resource] = await rankCheckResources("project_1", [
      checkRecord({ billingUnits: 2, costCents: 2 }),
    ]);

    expect(resource).toMatchObject({
      cost_cents: 2,
      usage: { quantity: 2, status: "confirmed", unit: "operations" },
    });
  });

  it("skips the ledger read for an empty page", async () => {
    const resources = await rankCheckResources("project_1", []);

    expect(resources).toEqual([]);
    expect(mocks.rankCheckLedgerActuals).not.toHaveBeenCalled();
  });

  it("derives no override without receipts", () => {
    expect(rankCheckAccountingOverride(checkRecord(), undefined)).toBeUndefined();
    expect(rankCheckAccountingOverride(checkRecord(), ledger({ receiptCount: 0 }))).toBeUndefined();
  });
});
