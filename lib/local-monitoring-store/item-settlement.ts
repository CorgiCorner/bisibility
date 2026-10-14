import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  applySubmissionEvent,
  submissionSettlementReceipt,
} from "@/lib/local-monitoring/submission-state";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { localDigest } from "./canonical";
import type { LocalDatabase, LocalTransaction } from "./context";
import { assertLocalCustody, assertLocalPossibleSend } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { settleLocalMeter } from "./meter-settlement";
import { releaseProvenLocalOwner } from "./ownership";
import { lockedLocalItem } from "./repository";
import { submissionRecordSchema } from "./schema";

export async function settleLocalItemInTransaction(
  tx: LocalTransaction,
  projectId: string,
  runId: string,
  key: string,
  receipt?: ProviderUsageReceipt,
) {
  const { item, record } = await lockedLocalItem(tx, projectId, key);
  if (item.runId !== runId || !record.attemptId || !record.outcome)
    throw new LocalMeasurementConflictError();
  const id = await assertLocalCustody(tx, item, record);
  await assertLocalPossibleSend(tx, item);
  const native = submissionSettlementReceipt(record);
  if (receipt && localDigest(receipt) !== localDigest(native))
    throw new LocalMeasurementConflictError();
  if (record.settlementRecorded) return record;
  await settleLocalMeter(tx, item.connectionId, item.correlationId, id, native);
  const next = submissionRecordSchema.parse(
    applySubmissionEvent(record, { kind: "settlement", attemptId: id }),
  );
  const changed = await tx.localMeasurementRunItem.updateMany({
    where: { id: item.id, version: record.version },
    data: { record: next as Prisma.InputJsonValue, version: next.version },
  });
  if (changed.count !== 1) throw new LocalMeasurementConflictError();
  await tx.localMeasurementTargetOwner.updateMany({
    where: { projectId, targetId: item.targetId, itemId: item.id },
    data: { workerToken: null, workerExpiresAt: null, version: { increment: 1 } },
  });
  await releaseProvenLocalOwner(tx, item, next);
  return next;
}
/** Sealed paid continuation may retain response proof after launcher revocation/hold. */
export function settleLocalItem(
  db: LocalDatabase,
  projectId: string,
  runId: string,
  key: string,
  receipt: ProviderUsageReceipt,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
    return settleLocalItemInTransaction(tx, projectId, runId, key, receipt);
  });
}
