import type { Prisma } from "@/lib/generated/prisma/client";
import type { Operation, Receipt } from "@usagekit/core";
import { projectAdmissionMeasurements } from "./current-paid-measurements";
import { verifyMatchedOwnImports } from "./import-proof";

/** A newer native dimension cannot undo invoice money; no intermediate false cost is projected. */
export async function composeOwnReceipt(
  tx: Prisma.TransactionClient,
  operation: Operation,
  native: Receipt,
): Promise<Receipt> {
  const invoice = operation.receipts.at(-1);
  if (invoice?.source !== "import") return native;
  await verifyMatchedOwnImports(tx, operation);
  return projectAdmissionMeasurements(operation, {
    ...native,
    id: `${invoice.evidenceRef}:native:${native.id}`,
    source: "import",
    evidenceRef: invoice.evidenceRef,
    cost: invoice.cost,
    providerRequestId: invoice.providerRequestId,
    occurredAt: invoice.occurredAt,
    measurements: [
      ...invoice.measurements.filter(
        (measurement) =>
          measurement.unit === "cents" ||
          !native.measurements.some((value) => value.unit === measurement.unit),
      ),
      ...native.measurements.filter((measurement) => measurement.unit !== "cents"),
    ],
  });
}
