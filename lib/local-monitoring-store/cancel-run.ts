import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { applySubmissionEvent } from "@/lib/local-monitoring/submission-state";
import { z } from "zod";
import { localProjectScope } from "./access";
import { auditLocal } from "./audit";
import type { LocalDatabase, LocalStoreContext } from "./context";
import { LocalMeasurementConflictError, LocalMeasurementUnavailableError } from "./errors";
import { localItemRefSchema, localItemScope } from "./item-scope";
import { projectRef, runRef, submissionRecordSchema } from "./schema";
import { cancelOriginalUnfencedLocalItem } from "./unfenced-release";
import { isUnsentLocalProjection } from "./unsent-projection";

const cancelSchema = z
  .object({ projectId: projectRef, runId: runRef, expectedVersion: z.number().int().nonnegative() })
  .strict();

export async function cancelLocalMeasurementRun(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const data = cancelSchema.parse(command);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, data.projectId, "update");
    const run = await tx.localMeasurementRun.findFirst({
      where: { projectId: scope.project.id, publicId: data.runId },
    });
    if (!run) throw new LocalMeasurementUnavailableError();
    if (run.cancellationRequested)
      return { id: run.publicId, version: run.version, cancellationRequested: true };
    if (run.version !== data.expectedVersion) throw new LocalMeasurementConflictError();
    const items = await tx.localMeasurementRunItem.findMany({
      where: { projectId: scope.project.id, runId: run.id },
      orderBy: { operationKey: "asc" },
      take: 101,
    });
    if (items.length > 100) throw new Error("Run exceeds the supported atomic taskset.");
    for (const item of items) {
      const record = submissionRecordSchema.parse(item.record);
      if (record.version !== item.version) throw new LocalMeasurementConflictError();
      const next = submissionRecordSchema.parse(applySubmissionEvent(record, { kind: "cancel" }));
      const changed = await tx.localMeasurementRunItem.updateMany({
        where: { id: item.id, version: item.version },
        data: { record: next as Prisma.InputJsonValue, version: next.version },
      });
      if (changed.count !== 1) throw new LocalMeasurementConflictError();
    }
    const changed = await tx.localMeasurementRun.updateMany({
      where: { id: run.id, version: run.version },
      data: { cancellationRequested: true, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new LocalMeasurementConflictError();
    await auditLocal(tx, scope, {
      action: "local_measurement.cancel",
      targetType: "local_measurement_run",
      targetId: run.publicId,
      after: { state: "cancelled", version: run.version + 1, count: items.length },
    });
    return { id: run.publicId, version: run.version + 1, cancellationRequested: true };
  });
}
/** Optional explicit cleanup; canonical live unfenced proof is mandatory, expiry is not proof. */
export async function releaseCancelledUnsentLocalItem(
  command: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  const data = localItemRefSchema.parse(command);
  return db.$transaction(async (tx) => {
    const { scope, item, record } = await localItemScope(tx, context, data);
    if (!record.cancellationRequested || !isUnsentLocalProjection(record))
      throw new Error("Only a cancelled pre-send item can be released.");
    const next = await cancelOriginalUnfencedLocalItem(tx, item, record, new Date());
    await auditLocal(tx, scope, {
      action: "local_measurement.cancel",
      targetType: "local_measurement_run",
      targetId: data.runId,
      after: { state: "cancelled", version: next.version, count: 1 },
    });
    return { released: true };
  });
}
