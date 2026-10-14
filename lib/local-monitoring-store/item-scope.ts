import "server-only";
import { z } from "zod";
import { localProjectScope } from "./access";
import type { LocalStoreContext, LocalTransaction } from "./context";
import { LocalMeasurementUnavailableError } from "./errors";
import { lockedLocalItem } from "./repository";
import { projectRef, runRef, targetRef } from "./schema";
export const localItemRefSchema = z
  .object({ projectId: projectRef, runId: runRef, targetId: targetRef })
  .strict();
export type LocalItemRef = z.infer<typeof localItemRefSchema>;
export async function localItemScope(
  tx: LocalTransaction,
  context: LocalStoreContext,
  data: LocalItemRef,
) {
  const scope = await localProjectScope(tx, context, data.projectId, "update");
  const run = await tx.localMeasurementRun.findFirst({
    where: { projectId: scope.project.id, publicId: data.runId },
  });
  const target = await tx.localMeasurementTarget.findFirst({
    where: { projectId: scope.project.id, publicId: data.targetId },
  });
  if (!run || !target) throw new LocalMeasurementUnavailableError();
  const reference = await tx.localMeasurementRunItem.findFirst({
    where: { projectId: scope.project.id, runId: run.id, targetId: target.id },
    select: { operationKey: true },
  });
  if (!reference) throw new LocalMeasurementUnavailableError();
  const value = await lockedLocalItem(tx, scope.project.id, reference.operationKey);
  return { ...value, scope, run, target };
}
