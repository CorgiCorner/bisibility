import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  read: vi.fn(),
  status: vi.fn(),
  project: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.query, project: { findUnique: mocks.project } },
}));
vi.mock("@/lib/metering/store/budgets", () => ({
  currentBudgets: mocks.read,
  status: mocks.status,
}));

import { assertBudgetAvailable, monthlyLookupSpendByConnection, monthlySpendCents } from "./budget";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue([]);
});
test("missing Store cap fails closed", async () => {
  await expect(assertBudgetAvailable("p")).rejects.toMatchObject({ code: "budget_exhausted" });
});
test("monthly provider cost comes only from effective Store receipts", async () => {
  mocks.query.mockResolvedValue([{ total: "1.1250" }]);
  await expect(monthlySpendCents("p", new Date("2026-10-10T00:00:00Z"))).resolves.toBe(1.125);
  const sql = mocks.query.mock.calls[0][0];
  expect(sql.text).toContain("metering_operation");
  expect(sql.text).not.toContain("provider_cost_entries");
  expect(sql.text).toContain('SUM("costCents")');
  expect(sql.values).toContain("p");
});
test("lookup aggregation preserves connection and feature dimensions", async () => {
  const rows = [{ connectionId: "c", feature: "keyword_research", costCents: 0.1, entryCount: 1 }];
  mocks.query.mockResolvedValue(rows);
  await expect(monthlyLookupSpendByConnection("p")).resolves.toEqual(rows);
  expect(mocks.query.mock.calls[0][0].text).toContain('GROUP BY "connectionId",feature');
});
test("project admission accounts for actual and outstanding Store quantities", async () => {
  const quantity = (value: bigint) => ({ value, scale: 4, unit: "budget_cents" });
  mocks.read.mockResolvedValue([
    {
      id: "project:p:monthly",
      scope: { kind: "group" },
      unit: "budget_cents",
      limit: quantity(100000n),
      onExceed: "block",
    },
  ]);
  mocks.status.mockResolvedValue({
    epoch: {
      epoch: "2026-10",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    },
    used: quantity(70000n),
    reserved: quantity(20000n),
    remaining: quantity(10000n),
  });
  await expect(assertBudgetAvailable("p", new Date(), { estimatedCostCents: 1 })).resolves.toEqual({
    capCents: 10,
    spentCents: 7,
    reservedCents: 2,
  });
  await expect(
    assertBudgetAvailable("p", new Date(), { estimatedCostCents: 1.0001 }),
  ).rejects.toMatchObject({
    code: "budget_exhausted",
    budget: {
      capCents: 10,
      spentCents: 7,
      reservedCents: 2,
      resetAt: new Date("2026-11-01T00:00:00.000Z"),
    },
  });
});
test("unresolved project history blocks new calls even with no monetary estimate", async () => {
  mocks.read.mockResolvedValue([
    {
      id: "project:p:monthly",
      unit: "budget_cents",
      limit: { value: 100n, scale: 0 },
      onExceed: "block",
    },
    { id: "unknown", unit: "paid_attempts", limit: { value: 0n, scale: 0 }, onExceed: "block" },
  ]);
  mocks.status
    .mockResolvedValueOnce({ remaining: { value: 100n, scale: 0 } })
    .mockResolvedValueOnce({
      epoch: { epoch: "unresolved", startsAt: "2026-10-01T00:00:00.000Z", endsAt: null },
      remaining: { value: 0n, scale: 0 },
    });
  await expect(assertBudgetAvailable("p")).rejects.toMatchObject({
    code: "budget_exhausted",
    budget: { reason: "usage_reconciliation_required", resetAt: null },
  });
});
