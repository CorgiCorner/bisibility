import "server-only";

import { Context } from "@temporalio/activity";
import { type SyncTrafficForAllProjectsResult, syncTrafficForAllProjects } from "../traffic/sync";
import { syncFirstTrafficIntentActivity } from "./traffic-first-sync-activity";
import type { FirstTrafficSyncWorkflowInput } from "./traffic-first-sync-contract";

export type SyncTrafficActivityResult = SyncTrafficForAllProjectsResult;

export async function syncTrafficActivity(): Promise<SyncTrafficActivityResult> {
  const now = new Date();
  let scheduledFor: Date | null = null;

  try {
    const scheduledTimestampMs = Context.current().info.scheduledTimestampMs;
    if (Number.isFinite(scheduledTimestampMs)) scheduledFor = new Date(scheduledTimestampMs);
  } catch {
    // Direct calls outside a Temporal Activity have no occurrence timestamp.
  }

  return syncTrafficForAllProjects(now, scheduledFor);
}

export type { FirstTrafficSyncWorkflowInput };
export { syncFirstTrafficIntentActivity };
