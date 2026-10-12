import { cancelUnsentPaidAttempt } from "./cancel-paid-attempt";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import { receiptFromEntry } from "./mapping";
import { correctComposedNativeEvidence } from "./native-composition";
import { paidContext } from "./paid-context";
import { composeOwnReceipt } from "./receipt-composition";
import { claimPaidAttemptRecovery, correctPaidAttempt, settlePaidAttempt } from "./settlement";
import { createTransactionMeter, readPaidOperation } from "./transaction-meter";
import { ownTransportRef } from "./transport-own-admission";
import { retainNativeProof } from "./transport-proof-extension";

export async function acknowledgeOwnTransport(tx: Prisma.TransactionClient, id: string) {
  const ref = await ownTransportRef(tx, id);
  const [binding] = await tx.$queryRaw<
    { found: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM metering_paid_attempt_context WHERE namespace=${ref.namespace} AND operation_id=${id} AND principal=${ref.principal}) AS found`;
  // Historical observation has no dispatch capability; trusted import repairs it separately.
  if (!binding?.found) return false;
  const meter = await createTransactionMeter(tx);
  let operation = await readPaidOperation(meter, ref);
  const entry = await loadByokEvidence(tx, id);
  if (!entry) throw new Error("Native proof is unavailable");
  const nativeReceipt = receiptFromEntry(entry, new Date());
  // Catalog reservations count the single fenced HTTP attempt independently of its cost.
  if (operation.estimate.some((quantity) => quantity.unit === "requests")) {
    nativeReceipt.source = "dispatch";
    nativeReceipt.measurements = [
      ...nativeReceipt.measurements,
      {
        unit: "requests",
        certainty: "measured",
        quantity: { unit: "requests", value: 1n, scale: 0 },
      },
    ];
  }
  const native = await retainNativeProof(
    tx,
    {
      attemptId: id,
      namespace: ref.namespace,
      principal: ref.principal,
      connectionId: entry.connectionId,
      credentialVersion: entry.providerCredentialVersion,
    },
    nativeReceipt,
  );
  const receipt = await composeOwnReceipt(tx, operation, native);
  if (operation.receipts.some((r) => r.id === native.id)) return true;
  const context = await paidContext(tx, ref);
  if (!context.fenced_at) throw new Error("Native paid proof requires a transport fence");
  const previous = operation.receipts.at(-1);
  let authority: import("@usagekit/core").Authority;
  if (operation.state === "pending" || operation.state === "settled")
    authority = { kind: "late_evidence", source: "retained_own_key_native_receipt" };
  else if (operation.lease && new Date(operation.lease.expiresAt) > new Date())
    authority = { kind: "lease", leaseId: operation.lease.leaseId };
  else {
    const recovery = await claimPaidAttemptRecovery(tx, ref, `own-proof:${id}`);
    operation = recovery.operation;
    authority = recovery.authority;
  }
  const input = {
    ...ref,
    expectedVersion: operation.version,
    commandId: `own-proof:${receipt.id}`,
    authority,
    receipt,
  };
  if (previous?.source === "import") {
    const result = await correctComposedNativeEvidence(
      tx,
      {
        ...input,
        replacesReceiptId: previous.id,
        reason: "native_dimensions_with_trusted_invoice_cost",
      },
      native,
      new Date(),
    );
    if (result.outcome !== "settled") throw new Error("Paid composition refused");
  } else if (previous)
    await correctPaidAttempt(tx, {
      ...input,
      replacesReceiptId: previous.id,
      reason: "retained_own_key_proof_updated",
    });
  else await settlePaidAttempt(tx, input);
  return true;
}
export async function cancelOwnTransports(tx: Prisma.TransactionClient, ids: readonly string[]) {
  for (const id of [...ids].sort())
    await cancelUnsentPaidAttempt(tx, await ownTransportRef(tx, id));
}
