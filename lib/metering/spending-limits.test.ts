import { describe, expect, it } from "vitest";
import { platformAllocationTag } from "./paid-quote";
import * as limits from "./spending-limits";

describe("persisted spending limit definitions", () => {
  it("maps every project cap to a blocking group budget, including initialized projects", () => {
    const budget = limits.projectSpendingBudget("test", "project", "12.3456", 2);
    expect(budget).toMatchObject({
      id: "project:project:monthly",
      version: 2,
      scope: { kind: "group", namespace: "test", group: "project" },
      surface: "any",
      unit: "budget_cents",
      limit: { value: 123456n, scale: 4 },
      onExceed: "block",
      window: { kind: "calendar_month", timezone: "UTC" },
    });
    expect(limits.projectSpendingBudget("test", "project", "0", 1).limit).toBeNull();
    expect(limits.projectSpendingBudget("test", "project", "-1", 1).limit).toBeNull();
    expect(limits.projectSpendingBudget("test", "project", null, 1).limit).toBeNull();
    expect(() => limits.projectSpendingBudget("test", "project", "0.00001", 1)).toThrow(
      "precision",
    );
  });
  for (const kind of ["group", "connection"] as const)
    it(`retains an unknown-cost ${kind} gate until explicit reconciliation`, () => {
      const scope =
        kind === "group"
          ? { kind, namespace: "test", group: "project" }
          : { kind, namespace: "test", connection: "connection" };
      expect(
        limits.unresolvedSpendingGate(scope, "migration", "2026-09-01T00:00:00.000Z", 1),
      ).toMatchObject({
        scope,
        surface: "any",
        unit: "paid_attempts",
        onExceed: "block",
        limit: { unit: "paid_attempts", value: 0n, scale: 0 },
        window: { kind: "since_reset", epoch: "migration", startsAt: "2026-09-01T00:00:00.000Z" },
      });
    });
  it("gate identities survive object key order and budget version changes", () => {
    const first = limits.unresolvedSpendingGate(
      { kind: "group", namespace: "test", group: "p" },
      "migration",
      "2026-09-01T00:00:00.000Z",
      1,
    );
    const next = limits.unresolvedSpendingGate(
      { group: "p", namespace: "test", kind: "group" },
      "migration",
      "2026-09-01T00:00:00.000Z",
      2,
    );
    expect(next.id).toBe(first.id);
  });
  it("keeps platform budget identities while making funding tags mandatory", () => {
    const budgets = limits.fundingSpendingBudgets(
      "test",
      { id: "c", provider: "dataforseo", unit: "cents", app: null, programmatic: "0" },
      "platform",
      1,
    );
    expect(budgets.map((b) => b.id)).toEqual(["connection:c:app", "connection:c:programmatic"]);
    expect(budgets[0]).toMatchObject({
      scope: { kind: "tag", tag: platformAllocationTag("dataforseo", "c") },
      unit: "customer_cents",
      limit: null,
      onExceed: "block",
    });
    expect(budgets[1]?.limit?.value).toBe(0n);
  });
});
