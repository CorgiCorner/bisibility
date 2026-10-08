import type { BudgetStatus, UsageRow } from "@usagekit/core";
import { describe, expect, it } from "vitest";
import { projectAuthority, projectBudgetRow, projectUsageRow } from "./user-model";

const row: UsageRow = {
  dimensions: {
    connection: "private-connection",
    provider: "DataForSEO",
    surface: "app",
    source: "worker",
    platform_pool: "secret-pool",
  },
  cost: { money: { units: 9223372036854775807n, currency: "USD" }, certainty: "measured" },
  measurements: [
    { unit: "units", certainty: "unknown", quantity: null },
    {
      unit: "customer_cents",
      certainty: "measured",
      quantity: { unit: "customer_cents", value: 1234567890123456789n, scale: 4 },
    },
  ],
  fundingSource: "byok",
  costOwner: "private-payer",
  unknownOperations: 2n,
};
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
  it("keeps exact money beyond Number range and unknown quantity without payer identities", () => {
    const data = projectUsageRow(row, "prc_public");
    expect(data).toMatchObject({
      providerCost: "9223372036854.775807",
      units: null,
      customerCharge: null,
      unknownOperations: "2",
    });
    expect(JSON.stringify(data)).not.toMatch(/private-|secret-pool/);
  });
  it("shows acknowledged customer charges separately and hides platform upstream costs", () => {
    expect(projectUsageRow({ ...row, fundingSource: "platform" }, "prc_public")).toMatchObject({
      providerCost: null,
      customerCharge: "1234567890123.456789",
      certainty: "measured",
    });
    expect(
      projectUsageRow({ ...row, fundingSource: "platform", measurements: [] }, null),
    ).toMatchObject({ providerCost: null, customerCharge: null, certainty: "unknown" });
    expect(
      projectUsageRow(
        {
          ...row,
          fundingSource: "platform",
          measurements: [
            {
              unit: "customer_cents",
              certainty: "estimated",
              quantity: { unit: "customer_cents", value: 999n, scale: 4 },
            },
          ],
        },
        null,
      ),
    ).toMatchObject({ providerCost: null, customerCharge: null, certainty: "estimated" });
  });
  it("preserves negative budget remainder and distinguishes warning from hard limit", () => {
    expect(projectBudgetRow(budget, "prc_public", true)).toMatchObject({
      scope: "project",
      connection: null,
      remaining: "-0.6000",
      hardLimit: "2.0000",
      policy: "allow",
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
  it("requires complete inventory and complete period coverage before claiming active authority", () => {
    expect(projectAuthority([], true)).toBe("legacy");
    expect(projectAuthority([], false)).toBe("unknown");
    const full = { mode: "active", coverage: "full", windows: [] } as const;
    expect(projectAuthority([full], true)).toBe("active");
    expect(projectAuthority([full, { mode: "legacy", coverage: "none", windows: [] }], true)).toBe(
      "mixed",
    );
    expect(projectAuthority([{ ...full, coverage: "partial" }], true)).toBe("mixed");
  });
});
