import "server-only";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import type { LocalContinuationLease } from "@/lib/local-monitoring-store/continuation-lease";
/** Releases only the completed continuation lease, never the target owner, grant or financial hold. */
export function releaseMonitorContinuationLease(db: LocalDatabase, lease: LocalContinuationLease) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${lease.projectId} FOR UPDATE`;
    await tx.localMeasurementTargetOwner.updateMany({
      where: {
        projectId: lease.projectId,
        targetId: lease.targetId,
        itemId: lease.itemId,
        version: lease.version,
        workerToken: lease.token,
      },
      data: { workerToken: null, workerExpiresAt: null, version: { increment: 1 } },
    });
  });
}
