import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { LocalTransaction } from "./context";
import { LocalMeasurementConflictError, LocalMeasurementUnavailableError } from "./errors";
import { executionTargetSchema, submissionRecordSchema } from "./schema";

export const localKeywordSelect = {
  id: true,
  text: true,
  device: true,
  locationId: true,
  updatedAt: true,
  measurementTargetEpoch: true,
  measurementPolicyEpoch: true,
} as const satisfies Prisma.KeywordSelect;
export async function loadLocalTarget(tx: LocalTransaction, projectId: string, publicId: string) {
  const row = await tx.localMeasurementTarget.findFirst({
    where: { projectId, publicId },
  });
  if (!row) throw new LocalMeasurementUnavailableError();
  const target = executionTargetSchema.parse(row.target);
  if (
    target.projectId !== projectId ||
    (row.keywordId !== null && target.keywordId !== row.keywordId)
  )
    throw new LocalMeasurementConflictError();
  const point = await tx.localMeasurementPoint.findFirst({
    where: { projectId, id: row.pointId },
  });
  if (!point) throw new LocalMeasurementUnavailableError();
  return { row, target, point };
}
export async function lockedLocalItem(tx: LocalTransaction, projectId: string, key: string) {
  await tx.$queryRaw`SELECT id FROM local_measurement_run_items WHERE "projectId"=${projectId} AND "operationKey"=${key} FOR UPDATE`;
  const item = await tx.localMeasurementRunItem.findFirst({
    where: { projectId, operationKey: key },
  });
  if (!item) throw new LocalMeasurementUnavailableError();
  const record = submissionRecordSchema.parse(item.record);
  if (
    record.key !== key ||
    record.scope.projectId !== projectId ||
    record.version !== item.version ||
    record.provider !== item.provider ||
    (record.attemptId !== null && record.attemptId !== item.preparedAttemptId)
  )
    throw new LocalMeasurementConflictError();
  const run = await tx.localMeasurementRun.findFirst({
    where: { projectId, id: item.runId },
    select: { quoteHash: true },
  });
  const target = await tx.localMeasurementTarget.findFirst({
    where: { projectId, id: item.targetId },
    select: { targetKey: true },
  });
  if (
    !run ||
    !target ||
    record.quoteHash !== run.quoteHash ||
    record.targetKey !== target.targetKey
  )
    throw new LocalMeasurementConflictError();
  return { item, record };
}
