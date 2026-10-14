import "server-only";
import { auditLocal } from "@/lib/local-monitoring-store/audit";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody } from "@/lib/local-monitoring-store/custody";
import { LocalMeasurementConflictError } from "@/lib/local-monitoring-store/errors";
import { type LocalItemRef, localItemScope } from "@/lib/local-monitoring-store/item-scope";
import { assertLocalTargetOwner } from "@/lib/local-monitoring-store/ownership";
import { cancelOriginalUnfencedLocalItem } from "@/lib/local-monitoring-store/unfenced-release";
import { isUnsentLocalProjection } from "@/lib/local-monitoring-store/unsent-projection";
import type { MonitorWorkerClaim } from "./contracts";
import { assertMonitorClaim } from "./repository";
/** Expiry alone never releases money: canonical cancel must prove the original attempt is unfenced. */
export async function releaseExpiredUnsentMonitorItem(
  reference: LocalItemRef,
  context: LocalStoreContext,
  claim: MonitorWorkerClaim,
  db: LocalDatabase,
  now: Date,
) {
  return db.$transaction(async (tx) => {
    const { scope, item, record } = await localItemScope(tx, context, reference);
    await assertMonitorClaim(tx, claim, now, true);
    if (!isUnsentLocalProjection(record)) return false;
    const owner = await assertLocalTargetOwner(tx, scope.project.id, item.targetId, item.id);
    if (owner.workerExpiresAt && owner.workerExpiresAt > now) return false;
    const id = await assertLocalCustody(tx, item, record);
    const native = await tx.$queryRaw<Array<{ fencedAt: Date | null }>>`
      SELECT fenced_at AS "fencedAt" FROM metering_paid_attempt_context
      WHERE namespace=${item.namespace} AND operation_id=${id}`;
    if (native.length !== 1) throw new LocalMeasurementConflictError();
    if (native[0].fencedAt !== null) return false; // Keep actual possible sends on original reconciliation.
    const next = await cancelOriginalUnfencedLocalItem(tx, item, record, now);
    await auditLocal(tx, scope, {
      action: "local_measurement.cancel",
      targetType: "local_measurement_run",
      targetId: reference.runId,
      after: { state: "cancelled", version: next.version, count: 1 },
    });
    return true;
  });
}
