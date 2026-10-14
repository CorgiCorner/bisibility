import "server-only";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { loadMonitorJob, publicMonitorIntent } from "./repository";
export async function readLatestMonitorIntent(
  tx: LocalTransaction,
  projectId: string,
  monitorId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM local_monitor_launch_intents WHERE "projectId"=${projectId} AND "monitorId"=${monitorId} ORDER BY "createdAt" DESC,id DESC LIMIT 1`;
  const job = rows[0] ? await loadMonitorJob(tx, rows[0].id) : null;
  return job ? publicMonitorIntent(job) : null;
}
