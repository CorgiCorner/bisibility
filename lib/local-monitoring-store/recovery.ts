import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { applySubmissionEvent } from "@/lib/local-monitoring/submission-state";
import { executionTargetSchema } from "@/lib/local-monitoring/target-key";
import {
  type LocalAcceptanceProofPort,
  localCanonicalFinancialState,
  terminalLocalProofReplay,
  verifyLocalAcceptanceProof,
} from "./acceptance-proof";
import { auditLocal } from "./audit";
import type { LocalDatabase, LocalStoreContext } from "./context";
import { assertLocalContinuationLease, type LocalContinuationLease } from "./continuation-lease";
import { assertLocalCustody, assertLocalPossibleSend } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { localItemRefSchema, localItemScope } from "./item-scope";
import { settleLocalItemInTransaction } from "./item-settlement";
import { releaseProvenLocalOwner } from "./ownership";
import { assertRetainedLocalKeywordDevice } from "./retained-keyword";
import { submissionRecordSchema } from "./schema";

/** Original native evidence replay, never prepare/submit. Public refs carry no proof JSON. */
export async function reconcileLocalMeasurementItem(
  command: unknown,
  context: LocalStoreContext,
  lease: LocalContinuationLease,
  clock: () => Date,
  db: LocalDatabase = prisma,
  proofPort?: LocalAcceptanceProofPort,
) {
  const data = localItemRefSchema.parse(command);
  const original = await db.$transaction(async (tx) => {
    const value = await localItemScope(tx, context, data);
    if (
      lease.purpose !== "reconcile" ||
      lease.projectId !== value.scope.project.id ||
      lease.runId !== value.run.id ||
      lease.itemId !== value.item.id
    )
      throw new Error("Reconciliation lease scope changed.");
    const target = executionTargetSchema.parse(value.target.target);
    await assertRetainedLocalKeywordDevice(tx, value.target, target);
    const id = await assertLocalCustody(tx, value.item, value.record);
    await assertLocalPossibleSend(tx, value.item);
    const terminal = await terminalLocalProofReplay(tx, id, value.record);
    if (!terminal) await assertLocalContinuationLease(tx, lease, clock());
    return { ...value, frozenTarget: target, id };
  });
  const supplied = proofPort
    ? await proofPort.loadVerifiedOriginalProof({
        ...original.item,
        attemptId: original.id,
        operationKey: original.record.key,
        targetKey: original.record.targetKey,
        adapterVersion: original.record.adapterVersion,
        device: original.frozenTarget.device,
      })
    : null;
  const retained = await db.$transaction(async (tx) => {
    const value = await localItemScope(tx, context, data); // Re-check revocation after async proof read.
    if (value.item.id !== original.item.id || value.item.preparedAttemptId !== original.id)
      throw new LocalMeasurementConflictError();
    const target = executionTargetSchema.parse(value.target.target);
    await assertRetainedLocalKeywordDevice(tx, value.target, target);
    await assertLocalCustody(tx, value.item, value.record);
    await assertLocalPossibleSend(tx, value.item);
    const next = supplied
      ? submissionRecordSchema.parse(
          applySubmissionEvent(value.record, {
            kind: "reconciled",
            attemptId: original.id,
            proof: verifyLocalAcceptanceProof(value.record, target, supplied),
          }),
        )
      : value.record;
    // Exact proof replay may succeed after final owner release, but never writes or grants send.
    const terminal = await terminalLocalProofReplay(tx, original.id, value.record);
    if (!terminal) await assertLocalContinuationLease(tx, lease, clock());
    if (next.version !== value.record.version) {
      const changed = await tx.localMeasurementRunItem.updateMany({
        where: { id: value.item.id, version: value.record.version },
        data: { version: next.version, record: next as Prisma.InputJsonValue },
      });
      if (changed.count !== 1) throw new LocalMeasurementConflictError();
      await auditLocal(tx, value.scope, {
        action: "local_measurement.reconcile",
        targetType: "local_measurement_run",
        targetId: value.run.publicId,
        after: {
          state: next.pendingReconciliationReason ?? next.status,
          version: next.version,
          count: 1,
        },
      });
    }
    return { ...value, record: next };
  });
  if (!retained.record.outcome || !retained.record.attemptId)
    return {
      status: "needs_provider_evidence" as const,
      reason: null,
      acceptance: "unknown" as const,
      version: retained.record.version,
    };
  // Evidence is durable before accounting. A failed correction leaves false settlement + owner.
  const settled = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${retained.scope.project.id} FOR UPDATE`;
    const record = await settleLocalItemInTransaction(
      tx,
      retained.scope.project.id,
      retained.run.id,
      retained.item.operationKey,
    );
    await releaseProvenLocalOwner(tx, retained.item, record);
    return { record, financialState: await localCanonicalFinancialState(tx, original.id) };
  });
  const record = settled.record;
  return {
    status: record.pendingReconciliationReason
      ? ("pending_reconciliation" as const)
      : record.status === "unknown_acceptance"
        ? ("needs_provider_evidence" as const)
        : settled.financialState !== "settled"
          ? ("accounting_pending" as const)
          : ("recorded" as const),
    reason: record.pendingReconciliationReason ?? null,
    financialState: settled.financialState,
    acceptance: record.outcome?.acceptance ?? null,
    version: record.version,
  };
}
