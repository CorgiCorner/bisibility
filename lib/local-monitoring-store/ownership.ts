import "server-only";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { LocalTargetBlocked } from "@/lib/local-monitoring/execution-types";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownTransportRef } from "@/lib/metering/transport-own-admission";
import type { LocalTransaction } from "./context";
import { LocalMeasurementConflictError } from "./errors";

export async function claimLocalTargetOwner(
  tx: LocalTransaction,
  projectId: string,
  targetId: string,
  itemId: string,
  worker?: { token: string; expiresAt: Date },
) {
  const owner = await tx.localMeasurementTargetOwner.findFirst({ where: { projectId, targetId } });
  if (owner) {
    const item = await tx.localMeasurementRunItem.findFirst({
      where: { projectId, id: owner.itemId },
    });
    throw new LocalTargetBlocked(item?.operationKey ?? "retained-owner");
  }
  await tx.localMeasurementTargetOwner.create({
    data: {
      projectId,
      targetId,
      itemId,
      ...(worker ? { workerToken: worker.token, workerExpiresAt: worker.expiresAt } : {}),
    },
  });
}
export async function assertLocalTargetOwner(
  tx: LocalTransaction,
  projectId: string,
  targetId: string,
  itemId: string,
) {
  const owner = await tx.localMeasurementTargetOwner.findFirst({
    where: { projectId, targetId, itemId },
  });
  if (!owner) throw new LocalMeasurementConflictError();
  return owner;
}
export async function releaseProvenLocalOwner(
  tx: LocalTransaction,
  item: { id: string; projectId: string; targetId: string; preparedAttemptId: string | null },
  record: SubmissionRecord,
) {
  // Partial accepted IDs cannot remove the remaining unknown acceptance gate.
  const terminal =
    !record.pendingReconciliationReason &&
    record.settlementRecorded &&
    (record.status === "rejected" ||
      (record.status === "accepted" && record.collectedEvidenceId !== null));
  if (!terminal || !item.preparedAttemptId) return;
  const operation = await readPaidOperation(
    await createTransactionMeter(tx),
    await ownTransportRef(tx, item.preparedAttemptId),
  );
  if (operation.state !== "settled") return; // Unknown financial outcome also retains ownership.
  await tx.localMeasurementTargetOwner.deleteMany({
    where: { projectId: item.projectId, targetId: item.targetId, itemId: item.id },
  });
}
