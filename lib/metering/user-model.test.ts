import type { BudgetStatus } from "@usagekit/core";
import { describe, expect, it } from "vitest";
import { projectBudgetRow } from "./user-model";

const budget: BudgetStatus = {
  budget: {
    id: "private-budget",
    version: 1,
    scope: { kind: "group", namespace: "n", group: "g" },
    surface: "worker",
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

describe("project Meter display boundary", () => {
  it("preserves negative budget remainder and distinguishes warning from hard limit", () => {
    expect(projectBudgetRow(budget, "prc_public", true)).toMatchObject({
      kind: "group",
      target: "project",
      remaining: { text: "-0.6" },
      boundary: { onExceed: "allow", hardLimit: { text: "2" } },
    });
    expect(JSON.stringify(projectBudgetRow(budget, null))).not.toMatch(/private-/);
  });
  it("omits shared and redacted bounds completely", () => {
    expect(projectBudgetRow({ ...budget, redacted: true }, null)).toBeNull();
    for (const scope of [
      { kind: "principal", namespace: "n", principal: "p" },
      { kind: "tag", namespace: "n", tag: "shared" },
      { kind: "platform_pool", namespace: "n", poolId: "private" },
      {
        kind: "access_credential",
        namespace: "n",
        accessCredential: { kind: "api_key", id: "private" },
      },
    ] as const)
      expect(projectBudgetRow({ ...budget, budget: { ...budget.budget, scope } }, null)).toBeNull();
  });
});
