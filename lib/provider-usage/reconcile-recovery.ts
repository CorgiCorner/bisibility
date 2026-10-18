import type { Prisma } from "@/lib/generated/prisma/client";
import { decimalQuantity, receiptFromEntry, reserveFromEntry } from "@/lib/metering/mapping";
import { projectAdmissionMeasurements } from "@/lib/metering/paid-measurements";
import { canonical, effective, hash } from "@/lib/metering/store/codec";
import { importHistoricalEvidence } from "@/lib/metering/store/host-history";
import { createSql } from "@/lib/metering/store/host-sql";
import { hydrate, operationRow } from "@/lib/metering/store/records";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { recoverOwnTransport } from "@/lib/metering/transport-own-recovery";
import { acknowledgeOwnTransport } from "@/lib/metering/transport-own-settlement";
import type { Operation, Receipt } from "@usagekit/core";
import { loadByokEvidence } from "./byok-evidence-storage";
import { queuedProof } from "./queued-proof";
import { reconcileSpendingGates } from "./reconcile-gates";
import { recoverRetainedNative } from "./reconcile-native";
import type { RecoveryCandidate } from "./reconcile-state";

async function recoverEvidence(tx: Prisma.TransactionClient, id: string, now: Date) {
  const entry = await loadByokEvidence(tx, id);
  if (!entry?.namespace) return false;
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  const [imported] = await tx.$queryRaw<{ operation_id: string }[]>`
    SELECT operation_id FROM metering_history_import WHERE namespace=${entry.namespace}
      AND source_id=${id} AND migration_id='20261011021000_accounting_history'`;
  const existing = await operationRow(sql, entry.namespace, imported?.operation_id ?? id);
  if (existing) {
    const original = await hydrate(sql, existing);
    const changed =
      (await acknowledgeOwnTransport(tx, id)) ||
      (await recoverRetainedNative(tx, original, receiptFromEntry(entry, now), now));
    if (changed)
      await reconcileSpendingGates(
        tx,
        await readPaidOperation(await createTransactionMeter(tx), {
          namespace: entry.namespace,
          principal: entry.ownerId,
          operationId: original.operationId,
        }),
      );
    return changed;
  }
  const [binding] = await tx.$queryRaw<
    { found: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM metering_paid_attempt_context WHERE namespace=${entry.namespace} AND operation_id=${id}) AS found`;
  // Lost live authority cannot be reconstructed from an observation alone.
  if (binding?.found) throw new Error("Original live paid operation is missing");
  const journal = await tx.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
  const { reservationTtlMs: _, ...original } = reserveFromEntry(
    entry.namespace,
    entry,
    journal.estimate as { cents: string; units: string },
  );
  const receipt = projectAdmissionMeasurements(original, receiptFromEntry(entry, now));
  const operation: Operation = {
    ...original,
    state: receipt.measurements.some((m) => m.quantity === null) ? "pending" : "settled",
    version: 1,
    lease: null,
    receipts: [receipt],
    budgetEpochs: [],
    createdAt: entry.createdAt.toISOString(),
    updatedAt: now.toISOString(),
    reservationExpiresAt: entry.createdAt.toISOString(),
  };
  const result = await importHistoricalEvidence(tx, {
    migrationId: "authoritative-proof-recovery",
    sourceId: id,
    sourceHash: hash(canonical(operation)),
    operation,
    cutoverAt: now.toISOString(),
  });
  if (result.outcome !== "imported") throw new Error("Retained proof import conflict");
  await reconcileSpendingGates(tx, operation);
  return true;
}
async function recoverOperation(
  tx: Prisma.TransactionClient,
  namespace: string,
  id: string,
  now: Date,
) {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  const row = await operationRow(sql, namespace, id);
  if (!row) throw new Error("Original accounting operation is unavailable");
  let operation = await hydrate(sql, row);
  const current = effective(operation);
  if (
    operation.state === "settled" &&
    current?.cost.certainty === "measured" &&
    current.measurements.every((m) => m.certainty === "measured" && m.quantity !== null)
  )
    return false;
  const proof = await queuedProof(tx, operation);
  if (!proof?.cost) return false;
  const original = effective(operation);
  if (original?.providerRequestId && original.providerRequestId !== proof.native)
    throw new Error("Original native queued identity conflicts");
  const [binding] = await tx.$queryRaw<
    { correlationId: string; transportFenced: boolean }[]
  >`SELECT context->>'correlationId' AS "correlationId",(fenced_at IS NOT NULL) AS "transportFenced" FROM metering_paid_attempt_context WHERE namespace=${namespace} AND operation_id=${id} AND principal=${operation.scope.principal}`;
  if (binding) {
    if (!binding.transportFenced)
      throw new Error("Queued acceptance has no retained transport fence");
    await recoverOwnTransport(tx, operation.scope.connection, binding.correlationId, {
      cached: false,
      failed: false,
      costCents: Number(proof.cost),
      quantity: 1,
      providerRequestId: proof.native,
    });
  } else {
    // Only inactive imported history has evidence authority without a live transport binding.
    if (!original || operation.lease || !["pending", "settled"].includes(operation.state))
      return false;
    const receipt: Receipt = projectAdmissionMeasurements(operation, {
      ...original,
      id: `queued-proof:${hash(canonical([namespace, id, proof]))}`,
      source: "dispatch",
      evidenceRef: proof.correlation,
      providerRequestId: proof.native,
      cost: {
        certainty: "measured",
        money: { units: decimalQuantity(proof.cost, "cents", 4).value, currency: "USD" },
      },
      measurements: [
        { unit: "units", certainty: "measured", quantity: { unit: "units", value: 1n, scale: 0 } },
      ],
      cached: false,
      failed: false,
      recordedAt: now.toISOString(),
      occurredAt: original.occurredAt,
    });
    if (!(await recoverRetainedNative(tx, operation, receipt, now))) return false;
  }
  operation = await readPaidOperation(await createTransactionMeter(tx), {
    namespace,
    principal: operation.scope.principal,
    operationId: id,
  });
  await reconcileSpendingGates(tx, operation);
  return true;
}
/** Retrieval uses only retained native evidence. This module never obtains a dispatch grant. */
export async function recoverCandidate(
  tx: Prisma.TransactionClient,
  namespace: string,
  candidate: RecoveryCandidate,
  now: Date,
) {
  return candidate.kind === "evidence"
    ? recoverEvidence(tx, candidate.id, now)
    : recoverOperation(tx, namespace, candidate.id, now);
}
