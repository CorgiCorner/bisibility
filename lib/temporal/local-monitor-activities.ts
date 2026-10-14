import "server-only";
import { executeMonitorJob } from "../local-monitor-worker/runtime";
/** The workflow payload contains only a retained intent ID, never a grant, token or provider request. */
export async function executeLocalMonitorIntentActivity(input: { id: string }) {
  return executeMonitorJob(input.id);
}
