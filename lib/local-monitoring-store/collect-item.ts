import "server-only";
import { prisma } from "@/lib/db/prisma";
import { collectLocalTarget } from "@/lib/local-monitoring/collect";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { auditLocal } from "./audit";
import type { LocalDatabase, LocalStoreContext } from "./context";
import { assertLocalContinuationLease, type LocalContinuationLease } from "./continuation-lease";
import { assertLocalCustody } from "./custody";
import { neutralLocalEvidencePort } from "./evidence-persistence";
import type { LocalNormalizationPort } from "./evidence-types";
import { localItemRefSchema, localItemScope } from "./item-scope";
import { localOperationStore } from "./operation-store";
import { retainedLocalPoint } from "./point";
import { executionTargetSchema } from "./schema";

/** Retrieves only original accepted IDs. Cancellation, quote/cache expiry do not buy replacements. */
export async function collectLocalMeasurementItem(
  command: unknown,
  context: LocalStoreContext,
  lease: LocalContinuationLease,
  adapter: Pick<LocalSubmitCollectAdapter, "collect" | "capability">,
  normalizer: LocalNormalizationPort,
  clock: () => Date,
  db: LocalDatabase = prisma,
) {
  const data = localItemRefSchema.parse(command);
  const binding = await db.$transaction(async (tx) => {
    const value = await localItemScope(tx, context, data);
    if (value.record.collectedEvidenceId) {
      const observation = await tx.observationRun.findFirst({
        where: {
          id: value.record.collectedEvidenceId,
          projectId: value.scope.project.id,
          neutralExecutionItemId: value.item.id,
        },
        select: { id: true },
      });
      if (!observation) throw new Error("Original collected evidence is unavailable.");
      if (normalizer.afterPersist) {
        const point = await tx.localMeasurementPoint.findFirst({
          where: { id: value.target.pointId, projectId: value.scope.project.id },
        });
        if (!point) throw new Error("Original collected point is unavailable.");
        await normalizer.afterPersist({
          tx,
          item: value.item,
          record: value.record,
          observationId: observation.id,
          target: executionTargetSchema.parse(value.target.target),
          point: retainedLocalPoint(point.point),
          replay: true,
          now: clock(),
        });
      }
      return { ...value, collected: true as const };
    }
    if (
      lease.purpose !== "collect" ||
      lease.projectId !== value.scope.project.id ||
      lease.runId !== value.run.id ||
      lease.itemId !== value.item.id
    )
      throw new Error("Collection lease scope changed.");
    await assertLocalContinuationLease(tx, lease, clock());
    await assertLocalCustody(tx, value.item, value.record);
    return { ...value, collected: false as const };
  });
  if (binding.collected) return { collected: true, replayed: true };
  const store = localOperationStore(db, binding.scope.project.id, binding.run.id);
  const evidence = neutralLocalEvidencePort(db, lease, normalizer, clock);
  const result = await collectLocalTarget({
    key: binding.item.operationKey,
    store,
    evidence,
    adapter: {
      ...adapter,
      assertRetrieval: async () => {
        await ownAdmission.assertRetrieval(db, binding.item.connectionId, [
          binding.item.correlationId,
        ]);
      },
    },
  });
  await db.$transaction(async (tx) => {
    const current = await localItemScope(tx, context, data);
    await auditLocal(tx, current.scope, {
      action: "local_measurement.collect",
      targetType: "local_measurement_run",
      targetId: current.run.publicId,
      after: { state: current.record.status, version: current.record.version, count: 1 },
    });
  });
  return { collected: true, replayed: result.replayed };
}
