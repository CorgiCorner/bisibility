import type { Prisma } from "@/lib/generated/prisma/client";
import { correctComposedNativeEvidence } from "@/lib/metering/native-composition";
import { projectAdmissionMeasurements } from "@/lib/metering/paid-measurements";
import { composeOwnReceipt } from "@/lib/metering/receipt-composition";
import { effective } from "@/lib/metering/store/codec";
import { createTransactionMeter } from "@/lib/metering/transaction-meter";
import { retainNativeProof } from "@/lib/metering/transport-proof-extension";
import type { Authority, Operation, Receipt } from "@usagekit/core";

/** Retained observations have evidence authority only, including after business deletion. */
export async function recoverRetainedNative(
  tx: Prisma.TransactionClient,
  operation: Operation,
  native: Receipt,
  now: Date,
) {
  if (operation.fundingSource !== "byok")
    throw new Error("Platform recovery requires wallet coordination");
  if (operation.receipts.some((r) => r.id === native.id)) return false;
  if (operation.lease && Date.parse(operation.lease.expiresAt) > now.getTime()) return false;
  const meter = await createTransactionMeter(tx, { now: () => now });
  const previous = effective(operation);
  const [invoice] =
    previous?.source === "import"
      ? await tx.$queryRaw<
          { found: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM metering_import WHERE import_id=${previous.evidenceRef ?? ""} AND namespace=${operation.scope.namespace}) AS found`
      : [];
  const retained = await retainNativeProof(
    tx,
    {
      attemptId: operation.operationId,
      namespace: operation.scope.namespace,
      principal: operation.scope.principal,
      connectionId: operation.scope.connection,
      credentialVersion: operation.scope.providerCredentialVersion,
    },
    native,
  );
  const receipt = invoice?.found
    ? await composeOwnReceipt(tx, operation, retained)
    : projectAdmissionMeasurements(operation, {
        ...retained,
        cost:
          retained.cost.certainty === "unknown" && previous?.cost.certainty === "measured"
            ? previous.cost
            : retained.cost,
        measurements: retained.measurements.map((m) =>
          m.certainty === "unknown"
            ? (previous?.measurements.find(
                (p) => p.unit === m.unit && p.certainty === "measured",
              ) ?? m)
            : m,
        ),
      });
  let authority: Authority = { kind: "late_evidence", source: "retained_native_proof" };
  if (!["pending", "settled", "released"].includes(operation.state)) {
    const claimed = await meter.claimForRecovery({
      namespace: operation.scope.namespace,
      principal: operation.scope.principal,
      operationId: operation.operationId,
      holder: "native-proof-recovery",
      leaseTtlMs: 60000,
    });
    if (!("claimed" in claimed) || !claimed.claimed) return false;
    operation = claimed.operation;
    authority = { kind: "recovery", leaseId: claimed.lease.leaseId };
  }
  const input = {
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
    commandId: `native-proof:${receipt.id}`,
    expectedVersion: operation.version,
    authority,
    receipt,
  };
  const result = previous
    ? invoice?.found
      ? await correctComposedNativeEvidence(
          tx,
          {
            ...input,
            replacesReceiptId: previous.id,
            reason: "Recovered original native dimensions",
          },
          retained,
          now,
        )
      : await meter.correct({
          ...input,
          replacesReceiptId: previous.id,
          reason: "Recovered original native proof",
        })
    : await meter.settle(input);
  if (result.outcome !== "settled") throw new Error("Retained native recovery refused");
  return true;
}
