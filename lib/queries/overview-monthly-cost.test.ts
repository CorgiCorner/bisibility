import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOverviewMonthlyCost } from "./overview-monthly-cost";
import { ledgerActualCostCents } from "./rank-check-run-accounting";

const m = vi.hoisted(() => ({ checks: vi.fn(), ledger: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./rank-check-run-accounting", async (original) => ({
  ...(await original<typeof import("./rank-check-run-accounting")>()),
  rankCheckLedgerActuals: m.ledger,
}));
const db = { rankCheck: { findMany: m.checks } } as unknown as Prisma.TransactionClient;
const now = new Date("2026-10-12T12:00:00Z");
const where = { projectId: "owned-project", archivedAt: null };
beforeEach(() => {
  vi.clearAllMocks();
});
describe("monthly canonical cost across all business execution states", () => {
  it("adds billed failed and deferred attempts without relabeling completed-check count or forecasts", async () => {
    m.checks.mockResolvedValue([
      { id: "success", status: "completed" },
      { id: "failed", status: "failed" },
      { id: "deferred", status: "deferred" },
    ]);
    m.ledger.mockResolvedValue(
      new Map([
        ["success", { costCents: 0.06, receiptCount: 1 }],
        ["failed", { costCents: 0.07, receiptCount: 1 }],
        ["deferred", { costCents: 0, receiptCount: 1 }],
      ]),
    );
    expect(await readOverviewMonthlyCost("owned-project", where, now, db)).toEqual({
      checksThisMonth: 1,
      providerCostCents: 0.13,
    });
    expect(m.ledger).toHaveBeenCalledWith("owned-project", ["success", "failed", "deferred"], db);
    expect(m.checks.mock.calls[0][0].where).toEqual({
      keyword: where,
      checkedAt: { gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-11-01T00:00:00Z") },
    });
  });
  it.each([undefined, { costCents: null, receiptCount: 1 }, { costCents: 0, receiptCount: 0 }])(
    "does not convert missing/unknown evidence into zero (%j)",
    async (receipt) => {
      m.checks.mockResolvedValue([{ id: "failed", status: "failed" }]);
      m.ledger.mockResolvedValue(new Map(receipt ? [["failed", receipt]] : []));
      expect(
        ledgerActualCostCents(
          receipt
            ? { ...receipt, units: null, unconfirmedCount: 1, unitProvider: null }
            : undefined,
          777,
        ),
      ).toBeNull();
      expect(
        (await readOverviewMonthlyCost("owned-project", where, now, db)).providerCostCents,
      ).toBeNull();
    },
  );
  it("keeps explicit Local/asOf receipt scope and the empty-cohort zero distinct", async () => {
    m.checks.mockResolvedValue([]);
    m.ledger.mockResolvedValue(new Map());
    expect(await readOverviewMonthlyCost("owned-project", where, now, db, true)).toEqual({
      checksThisMonth: 0,
      providerCostCents: 0,
    });
    expect(m.checks.mock.calls[0][0].where).toMatchObject({
      createdAt: { lte: now },
      keyword: where,
      checkedAt: { lte: now },
    });
  });
});
