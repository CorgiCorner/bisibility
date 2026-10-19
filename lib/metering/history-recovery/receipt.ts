import { decimalQuantity } from "@/lib/metering/mapping";
import { projectAdmissionMeasurements } from "@/lib/metering/paid-measurements";
import type { Measurement, Operation, Quantity, Receipt } from "@usagekit/core";
import type { HistoricalResolution, HistoricalResolutionItem } from "./manifest";

function same(a: Quantity, b: Quantity) {
  const scale = Math.max(a.scale, b.scale);
  return a.value * 10n ** BigInt(scale - a.scale) === b.value * 10n ** BigInt(scale - b.scale);
}
/** An operator attests evidence; this never invents native transport or request proof. */
export function historicalResolutionReceipt(
  operation: Operation,
  original: Receipt,
  item: HistoricalResolutionItem,
  manifest: HistoricalResolution,
  context: {
    databaseRole: string;
    requiresUnits: boolean;
    receiptId: string;
    planHash: string;
    manifestHash: string;
    databaseIdentityHash: string;
  },
): Receipt {
  if (
    Date.parse(manifest.recordedAt) <
    Math.max(Date.parse(original.recordedAt), Date.parse(original.occurredAt))
  )
    throw new Error("Resolution cannot precede the retained receipt.");
  const retainedCost = original.cost.certainty === "measured" ? original.cost.money : null;
  const supplied = item.costCents == null ? null : decimalQuantity(item.costCents, "cents", 4);
  if (retainedCost && retainedCost.currency !== "USD")
    throw new Error("Unsupported retained currency.");
  if (retainedCost && supplied && retainedCost.units !== supplied.value)
    throw new Error("Measured legacy cost must be preserved.");
  if (!retainedCost && !supplied)
    throw new Error("An unknown cost needs an explicit evidenced amount.");
  const cost =
    retainedCost ?? (supplied ? { units: supplied.value, currency: "USD" as const } : null);
  if (!cost) throw new Error("Missing historical cost evidence.");
  const previousUnits = original.measurements.find((m) => m.unit === "units");
  const providedUnits = item.units == null ? null : decimalQuantity(item.units, "units", 6);
  if (
    previousUnits?.certainty === "measured" &&
    providedUnits &&
    !same(previousUnits.quantity, providedUnits)
  )
    throw new Error("Measured legacy units must be preserved.");
  let native: Measurement[] = [];
  let omitted = false;
  if (providedUnits) native = [{ unit: "units", certainty: "measured", quantity: providedUnits }];
  else if (previousUnits?.certainty === "measured") native = [previousUnits];
  else if (
    operation.provider === "dataforseo" &&
    item.omitUnknownUnits &&
    !context.requiresUnits &&
    (!previousUnits || previousUnits.certainty === "unknown")
  )
    omitted = true;
  else throw new Error("Unknown units need evidence; a budget or quota unit cannot be omitted.");
  if (item.omitUnknownUnits && !omitted)
    throw new Error("Only unknown unbudgeted DataForSEO units may be omitted.");
  if (
    original.measurements.some(
      (m) => !["units", "cents", "budget_cents", "paid_attempts"].includes(m.unit),
    )
  )
    throw new Error("Unsupported historical measurement dimension.");
  return {
    ...projectAdmissionMeasurements(operation, {
      ...original,
      id: context.receiptId,
      source: "probe",
      supersedes: original.id,
      evidenceRef: manifest.evidenceRef,
      occurredAt: original.occurredAt,
      recordedAt: manifest.recordedAt,
      cost: { certainty: "measured", money: cost },
      measurements: native,
    }),
    ...{
      metadata: {
        historicalResolution: {
          operator: manifest.operator,
          databaseRole: context.databaseRole,
          reason: manifest.reason,
          evidenceRef: manifest.evidenceRef,
          originalReceiptId: original.id,
          planHash: context.planHash,
          manifestHash: context.manifestHash,
          databaseIdentityHash: context.databaseIdentityHash,
          costSource: retainedCost ? "retained_measured" : "operator_attested",
          unitsSource: omitted
            ? "unknown_unbudgeted_omitted"
            : providedUnits
              ? "operator_attested"
              : "retained_measured",
          omittedUnknownUnits: omitted ? ["units"] : [],
        },
      },
    },
  };
}
