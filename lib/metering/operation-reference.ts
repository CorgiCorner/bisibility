import { meteringNamespace } from "./runtime";

export type MeterOperationReference = { version: 1; namespace: string; operationId: string };
export function meterOperationReference(
  operationId: string,
  namespace = meteringNamespace(),
): MeterOperationReference {
  return { version: 1, namespace, operationId };
}
/** Historical JSON is translated at read time; new persisted receipts carry a versioned reference. */
export function receiptOperationId(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== "object") return null;
  const value = receipt as {
    operationRef?: MeterOperationReference | null;
    providerCostEntryId?: string | null;
  };
  if (
    value.operationRef &&
    (value.operationRef.version !== 1 || value.operationRef.namespace !== meteringNamespace())
  )
    throw new Error("Receipt operation namespace or version is invalid.");
  return value.operationRef?.operationId ?? value.providerCostEntryId ?? null;
}
