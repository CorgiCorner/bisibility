import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import type { MonitorWorkerClaim } from "./contracts";
import { loadMonitorJob, MONITOR_WORKER_LEASE_MS } from "./repository";
/** Opaque workflow IDs are looked up in the immutable accepted-command store, never treated as authority. */
export async function claimMonitorJob(
  id: string,
  db: LocalDatabase = prisma,
  clock = () => new Date(),
): Promise<MonitorWorkerClaim | null> {
  return db.$transaction(async (tx) => {
    const found = await loadMonitorJob(tx, id);
    if (!found) return null;
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${found.projectId} FOR UPDATE`;
    const job = await loadMonitorJob(tx, id, true);
    const now = requireLocalTime(clock());
    if (
      !job ||
      job.state === "complete" ||
      job.state === "blocked" ||
      (job.leaseExpiresAt && job.leaseExpiresAt > now)
    )
      return null;
    const token = randomUUID(),
      generation = job.leaseVersion + 1;
    await tx.$executeRaw`UPDATE local_monitor_launch_intents SET state='running',"leaseToken"=${token},"leaseVersion"=${generation},"leaseExpiresAt"=${new Date(now.getTime() + MONITOR_WORKER_LEASE_MS)},version=version+1,"updatedAt"=${now} WHERE id=${job.id}`;
    return { id: job.id, token, generation };
  });
}
