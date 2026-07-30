import "server-only";

import { Context } from "@temporalio/activity";
import { type SyncTrafficForAllProjectsResult, syncTrafficForAllProjects } from "../traffic/sync";

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
