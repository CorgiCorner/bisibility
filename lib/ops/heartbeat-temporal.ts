import "server-only";

import { getTemporalClient } from "@/lib/temporal/client";
import type { Client, ScheduleDescription } from "@temporalio/client";

export type TemporalScheduleIssue = {
  gapAt: string | null;
  missedCatchup: number;
  recoveredAt: string | null;
  scheduleId: string;
  skippedOverlap: number;
};

export type TemporalHeartbeat = {
  inspectionErrors: number;
  issueSchedules: string[];
  missedCatchupTotal: number;
  nextActionAt: string | null;
  recentActions: number;
  scheduleIssues: TemporalScheduleIssue[];
  schedules: number;
  skippedOverlapTotal: number;
};

export type OpsScheduleClient = Pick<Client["schedule"], "getHandle" | "list">;

function nextAction(descriptions: ScheduleDescription[]) {
  const times = descriptions.flatMap((description) => description.info.nextActionTimes);
  if (times.length === 0) return null;
  return new Date(Math.min(...times.map((time) => time.getTime()))).toISOString();
}

/** Inspect every Temporal Schedule. Missed/overlap counters are SDK lifetime counters. */
export async function collectTemporalHeartbeat(
  now: Date,
  injectedClient?: OpsScheduleClient,
): Promise<TemporalHeartbeat> {
  const scheduleClient = injectedClient ?? (await getTemporalClient()).schedule;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const descriptions: ScheduleDescription[] = [];
  const issueSchedules: string[] = [];
  const scheduleIssues: TemporalScheduleIssue[] = [];
  let inspectionErrors = 0;

  for await (const summary of scheduleClient.list()) {
    try {
      const description = await scheduleClient.getHandle(summary.scheduleId).describe();
      descriptions.push(description);
      const missed = description.info.numActionsMissedCatchupWindow;
      const skipped = description.info.numActionsSkippedOverlap;
      if (missed > 0 || skipped > 0) {
        issueSchedules.push(`${summary.scheduleId}: catchup ${missed}, overlap ${skipped}`);
        const recoveredAction = description.info.recentActions
          .filter((action) => action.takenAt.getTime() - action.scheduledAt.getTime() >= 60_000)
          .sort((left, right) => right.takenAt.getTime() - left.takenAt.getTime())[0];
        scheduleIssues.push({
          gapAt: recoveredAction?.scheduledAt.toISOString() ?? null,
          missedCatchup: missed,
          recoveredAt: recoveredAction?.takenAt.toISOString() ?? null,
          scheduleId: summary.scheduleId,
          skippedOverlap: skipped,
        });
      }
    } catch {
      inspectionErrors += 1;
      issueSchedules.push(`${summary.scheduleId}: inspection failed`);
    }
  }

  return {
    inspectionErrors,
    issueSchedules,
    missedCatchupTotal: descriptions.reduce(
      (sum, description) => sum + description.info.numActionsMissedCatchupWindow,
      0,
    ),
    nextActionAt: nextAction(descriptions),
    recentActions: descriptions.reduce(
      (sum, description) =>
        sum + description.info.recentActions.filter((action) => action.takenAt >= since).length,
      0,
    ),
    scheduleIssues,
    schedules: descriptions.length + inspectionErrors,
    skippedOverlapTotal: descriptions.reduce(
      (sum, description) => sum + description.info.numActionsSkippedOverlap,
      0,
    ),
  };
}
