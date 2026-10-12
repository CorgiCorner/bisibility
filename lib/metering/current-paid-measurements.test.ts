import type { Receipt } from "@usagekit/core";
import { expect, test } from "vitest";
import { projectAdmissionMeasurements } from "./current-paid-measurements";

const input = {
  provider: "serpapi",
  operation: "search",
  fundingSource: "byok" as const,
  estimate: [
    { unit: "cents", value: 0n, scale: 0 },
    { unit: "requests", value: 1n, scale: 0 },
    { unit: "units", value: 1n, scale: 0 },
    { unit: "budget_cents", value: 3n, scale: 1 },
  ],
};
function receipt(units: bigint | null): Receipt {
  return {
    id: "receipt",
    occurredAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    cached: false,
    failed: false,
    cost: { certainty: "measured", money: { currency: "USD", units: 0n } },
    measurements: [
      units === null
        ? { unit: "units", certainty: "unknown", quantity: null }
        : {
            unit: "units",
            certainty: "measured",
            quantity: { unit: "units", value: units, scale: 6 },
          },
    ],
  };
}
test("one search consumes its budget value while marginal money remains zero", () => {
  const result = projectAdmissionMeasurements(input, receipt(1000000n));
  expect(result.cost.money?.units).toBe(0n);
  expect(result.measurements).toContainEqual({
    unit: "budget_cents",
    certainty: "measured",
    quantity: { unit: "budget_cents", value: 3n, scale: 1 },
  });
});
test("cached or failed zero-unit receipts release the budget valuation", () => {
  expect(projectAdmissionMeasurements(input, receipt(0n)).measurements).toContainEqual({
    unit: "budget_cents",
    certainty: "measured",
    quantity: { unit: "budget_cents", value: 0n, scale: 1 },
  });
});
test.each([null, 2000000n])(
  "unknown or contradictory units cannot become a free search: %s",
  (units) => {
    expect(projectAdmissionMeasurements(input, receipt(units)).measurements).toContainEqual({
      unit: "budget_cents",
      certainty: "unknown",
      quantity: null,
    });
  },
);
test("legacy and platform operations keep their original monetary policy", () => {
  for (const operation of [
    { ...input, operation: "rank_check" },
    { ...input, fundingSource: "platform" as const },
  ]) {
    const result = projectAdmissionMeasurements(operation, receipt(1000000n));
    expect(
      result.measurements.find((q) => q.unit === "budget_cents")?.quantity?.value ?? null,
    ).toBe(operation.fundingSource === "platform" ? null : 0n);
  }
});
