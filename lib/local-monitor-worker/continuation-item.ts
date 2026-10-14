import "server-only";
import { executionTargetSchema } from "@/lib/local-monitoring/target-key";
import { resolveMapsCollectionPorts } from "@/lib/local-monitoring-host/maps-collection";
import { reconcileLocalHostItem } from "@/lib/local-monitoring-host/reconcile";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { claimLocalContinuation } from "@/lib/local-monitoring-store/continuation-lease";
import { type LocalItemRef, localItemScope } from "@/lib/local-monitoring-store/item-scope";
import { retainedLocalPoint } from "@/lib/local-monitoring-store/point";
import { isUnsentLocalProjection } from "@/lib/local-monitoring-store/unsent-projection";
import { MapsResultPendingError } from "@/lib/providers/local-search/maps-result";
import { releaseMonitorContinuationLease } from "./continuation-lease-release";
import type { MonitorWorkerClaim } from "./contracts";
import { assertMonitorClaim, MONITOR_WORKER_LEASE_MS } from "./repository";
import { releaseExpiredUnsentMonitorItem } from "./unsent";
export async function continueMonitorItem(
  reference: LocalItemRef,
  context: LocalStoreContext,
  claim: MonitorWorkerClaim,
  db: LocalDatabase,
  clock: () => Date,
): Promise<"pending" | "blocked" | "progress"> {
  const current = await db.$transaction(async (tx) => {
    const value = await localItemScope(tx, context, reference);
    const job = await assertMonitorClaim(tx, claim, clock(), true);
    const owner = await tx.localMeasurementTargetOwner.findFirst({
      where: {
        projectId: value.scope.project.id,
        targetId: value.item.targetId,
        itemId: value.item.id,
      },
    });
    return { ...value, owner, job };
  });
  const { record, owner } = current;
  if (!owner) return "progress";
  if (owner.workerExpiresAt && owner.workerExpiresAt > clock()) return "pending";
  if (isUnsentLocalProjection(record)) {
    if (await releaseExpiredUnsentMonitorItem(reference, context, claim, db, clock()))
      return "progress";
    if (record.attemptId === null) return "pending";
    // A native fence keeps the original reconcile path. Never infer zero cost from a missing outcome.
  }
  const collectable =
    record.settlementRecorded &&
    Boolean(record.outcome?.taskIds.length) &&
    record.collectedEvidenceId === null &&
    ["accepted", "unknown_acceptance"].includes(record.status);
  const purpose = collectable ? "collect" : "reconcile";
  if (purpose === "collect" && clock() >= current.job.collectionDeadline) return "blocked";
  const lease = await claimLocalContinuation(
    { ...reference, purpose, expectedVersion: owner.version },
    context,
    { ttlMs: MONITOR_WORKER_LEASE_MS, clock },
    db,
  );
  try {
    if (purpose === "reconcile") {
      const result = await reconcileLocalHostItem(reference, context, lease, clock, db);
      return result.status === "needs_provider_evidence" ? "blocked" : "progress";
    }
    if (
      !["accepted", "unknown_acceptance"].includes(record.status) ||
      record.collectedEvidenceId !== null
    )
      return "progress";
    const ports = await db.$transaction(async (tx) => {
      const value = await localItemScope(tx, context, reference);
      await assertMonitorClaim(tx, claim, clock(), true);
      const point = await tx.localMeasurementPoint.findFirstOrThrow({
        where: { id: value.target.pointId, projectId: value.scope.project.id },
      });
      return resolveMapsCollectionPorts(
        tx,
        {
          scope: value.scope,
          item: value.item,
          record: value.record,
          target: executionTargetSchema.parse(value.target.target),
          point: retainedLocalPoint(point.point),
        },
        db,
      );
    });
    try {
      await collectLocalMeasurementItem(
        reference,
        context,
        lease,
        ports.adapter,
        ports.normalizer,
        ports.clock,
        db,
      );
      return "progress";
    } catch (error) {
      if (error instanceof MapsResultPendingError) return "pending";
      throw error;
    }
  } finally {
    await releaseMonitorContinuationLease(db, lease);
  }
}
