import "server-only";
import { enqueueMonitorLaunch } from "@/lib/local-monitor-worker/enqueue";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
/** Web boundary: records verified intent only. Execution belongs exclusively to the existing worker. */
export function launchMonitor(input: unknown, context: LocalStoreContext, db?: LocalDatabase) {
  return enqueueMonitorLaunch(input, context, db);
}
