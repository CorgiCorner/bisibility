import "server-only";
import { occurrenceBody } from "@/lib/local-monitor-launch/identity";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { localDigest, requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import {
  jobSchema,
  type MonitorIntentView,
  type MonitorJob,
  type MonitorWorkerClaim,
} from "./contracts";
export const MONITOR_WORKER_LEASE_MS = 300_000;
export async function loadMonitorJob(
  tx: LocalTransaction,
  id: string,
  lock = false,
): Promise<MonitorJob | null> {
  const rows = lock
    ? await tx.$queryRaw<
        unknown[]
      >`SELECT * FROM local_monitor_launch_intents WHERE id=${id} FOR UPDATE`
    : await tx.$queryRaw<unknown[]>`SELECT * FROM local_monitor_launch_intents WHERE id=${id}`;
  if (!rows[0]) return null;
  const job = jobSchema.parse(rows[0]);
  if (
    (job.actorId !== null && job.bodyHash !== occurrenceBody(job.command, job.actorId)) ||
    !/^([a-f0-9]{64})$/.test(job.consentDigest) ||
    !/^([a-f0-9]{64})$/.test(job.connectionStamp)
  )
    throw new LocalMonitorConflictError();
  return job;
}
export function publicMonitorIntent(job: MonitorJob): MonitorIntentView {
  return {
    id: job.publicId,
    state: job.state,
    reason: job.reason,
    expectedCount: job.command.targetIds.length,
  };
}
export async function assertMonitorClaim(
  tx: LocalTransaction,
  claim: MonitorWorkerClaim,
  now: Date,
  renew = false,
) {
  const job = await loadMonitorJob(tx, claim.id, true);
  const time = requireLocalTime(now);
  if (
    !job ||
    job.leaseToken !== claim.token ||
    job.leaseVersion !== claim.generation ||
    !job.leaseExpiresAt ||
    job.leaseExpiresAt <= time ||
    job.state !== "running"
  )
    throw new LocalMonitorConflictError();
  if (renew)
    await tx.$executeRaw`UPDATE local_monitor_launch_intents SET "leaseExpiresAt"=${new Date(time.getTime() + MONITOR_WORKER_LEASE_MS)},version=version+1,"updatedAt"=${time} WHERE id=${job.id}`;
  return job;
}
export async function transitionMonitorJob(
  tx: LocalTransaction,
  claim: MonitorWorkerClaim,
  state: MonitorJob["state"],
  reason: MonitorJob["reason"],
  now: Date,
) {
  const job = await assertMonitorClaim(tx, claim, now);
  await tx.$executeRaw`UPDATE local_monitor_launch_intents SET state=${state},reason=${reason},"leaseToken"=NULL,"leaseExpiresAt"=NULL,version=version+1,"updatedAt"=${requireLocalTime(now)} WHERE id=${job.id}`;
}
export function approvalDigest(token: string) {
  return localDigest(["local-monitor-accepted-consent-v1", token]);
}
