import type { Measurement, Receipt, ReserveInput } from "@usagekit/core";

/** Reused by native settlement and the later atomic invoice import projection. */
export function projectAdmissionMeasurements(
  input: Pick<ReserveInput, "fundingSource">,
  receipt: Receipt,
): Receipt {
  const provider: Measurement = receipt.cost.money
    ? {
        unit: "cents",
        certainty: receipt.cost.certainty,
        quantity: { unit: "cents", value: receipt.cost.money.units, scale: 4 },
      }
    : { unit: "cents", certainty: "unknown", quantity: null };
  const customer = receipt.measurements.find((m) => m.unit === "customer_cents");
  const amount = input.fundingSource === "platform" ? customer : provider;
  const budget: Measurement = amount?.quantity
    ? {
        unit: "budget_cents",
        certainty: amount.certainty,
        quantity: { ...amount.quantity, unit: "budget_cents" },
      }
    : { unit: "budget_cents", certainty: "unknown", quantity: null };
  return {
    ...receipt,
    measurements: [
      ...receipt.measurements.filter(
        (m) =>
          !["cents", "budget_cents", "paid_attempts"].includes(m.unit) &&
          (input.fundingSource === "platform" || m.unit !== "customer_cents"),
      ),
      provider,
      budget,
      {
        unit: "paid_attempts",
        certainty: "measured",
        quantity: { unit: "paid_attempts", value: 1n, scale: 0 },
      },
    ],
  };
}
