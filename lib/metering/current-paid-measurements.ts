import type { Operation, Receipt } from "@usagekit/core";
import { projectAdmissionMeasurements as historicalMeasurements } from "./paid-measurements";

/** Native search receipts value measured units without turning a subscription into call money. */
export function projectAdmissionMeasurements(
  input: Pick<Operation, "fundingSource" | "provider" | "operation" | "estimate">,
  receipt: Receipt,
): Receipt {
  const projected = historicalMeasurements(input, receipt);
  const budget = input.estimate.find((q) => q.unit === "budget_cents");
  if (
    input.fundingSource !== "byok" ||
    input.provider !== "serpapi" ||
    input.operation !== "search" ||
    !budget ||
    !input.estimate.some((q) => q.unit === "requests") ||
    !input.estimate.some((q) => q.unit === "units" && q.value === 1n && q.scale === 0)
  )
    return projected;
  const units = receipt.measurements.find((m) => m.unit === "units");
  const quantity = units?.quantity;
  const known =
    units?.certainty === "measured" &&
    quantity &&
    (quantity.value === 0n || quantity.value === 10n ** BigInt(quantity.scale));
  return {
    ...projected,
    measurements: projected.measurements.map((m) =>
      m.unit !== "budget_cents"
        ? m
        : known
          ? {
              unit: "budget_cents",
              certainty: "measured",
              quantity: { ...budget, value: quantity.value === 0n ? 0n : budget.value },
            }
          : { unit: "budget_cents", certainty: "unknown", quantity: null },
    ),
  };
}
