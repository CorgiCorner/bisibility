import type { BudgetStatus } from "@usagekit/core";
import { expect, it } from "vitest";
import { sharedBudgetRow } from "./shared-budget-row";

const status: BudgetStatus = {
  budget: {
    id: "private-budget",
    version: 3,
    scope: { kind: "connection", namespace: "private-namespace", connection: "private-connection" },
    surface: "app",
    unit: "cents",
    limit: { value: 10000n, scale: 4, unit: "cents" },
    hardLimit: { value: 20000n, scale: 4, unit: "cents" },
    onExceed: "allow",
    window: { kind: "calendar_month", timezone: "UTC" },
  },
  epoch: {
    epoch: "private-epoch",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-11-01T00:00:00.000Z",
  },
  used: { value: 15000n, scale: 4, unit: "cents" },
  reserved: { value: 1000n, scale: 4, unit: "cents" },
  remaining: { value: -6000n, scale: 4, unit: "cents" },
};
it("uses shared exact geometry, retains overage and removes internal budget identities", () => {
  const row = sharedBudgetRow(status, "conn_public", true);
  if (!row) throw new Error("Verified budget figures must produce a shared row");
  expect(row.target).toBe("conn_public");
  expect(row.remaining).toMatchObject({ text: "-0.6" });
  expect(row.bar).toMatchObject({ used: "75", reserved: "5", limit: "50", hardLimit: "100" });
  expect(row.boundary).toMatchObject({ onExceed: "allow", hardLimit: { text: "2" } });
  expect(row.version).toBe(3);
  expect(JSON.stringify(row)).not.toContain("private-");
});
it("does not project a zero bar when accounting ownership or figures are unknown", () => {
  expect(sharedBudgetRow(status, "conn_public", false)).toMatchObject({
    limit: { text: "1", unit: "cents" },
    used: "unavailable",
    reserved: "unavailable",
    remaining: "unavailable",
    bar: null,
  });

  expect(sharedBudgetRow({ ...status, redacted: true }, "conn_public", true)).toBeUndefined();
});

it("withholds crossed alerts and fallback warnings when ownership is unproven", () => {
  const alerted = { ...status, budget: { ...status.budget, alerts: [{ at: { percent: 50 } }] } };
  expect(sharedBudgetRow(alerted, "conn_public", true)?.alerts[0].crossed).toBe(true);
  expect(sharedBudgetRow(alerted, "conn_public", false)).toMatchObject({
    alerts: [],
    warningAt: null,
  });
  expect(sharedBudgetRow(status, "conn_public", false)?.warningAt).toBeNull();
});
