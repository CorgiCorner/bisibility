import type { DatabaseHeartbeat } from "./heartbeat-data";
import { relativeTime } from "./heartbeat-traffic-format";

type DispatchReason = { severity: "warning"; text: string };

function countWithNoun(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countLine(count: number, noun: string, oldest: string | null, now: Date) {
  const age = count > 0 && oldest ? ` (oldest ${relativeTime(oldest, now)})` : "";
  return `${countWithNoun(count, noun)}${age}`;
}

export function dispatchLine(database: DatabaseHeartbeat, now: Date) {
  const dispatch = database.dispatch;
  if (!dispatch) return "Unavailable - backlog was not evaluated";
  return [
    countLine(dispatch.expiredClaims, "expired unlinked claim", dispatch.oldestExpiredClaimAt, now),
    countLine(dispatch.overdueQueued, "overdue queued target", dispatch.oldestOverdueQueuedAt, now),
  ].join(" · ");
}

export function dispatchReasons(database: DatabaseHeartbeat, now: Date): DispatchReason[] {
  const reasons: DispatchReason[] = [];
  const dispatch = database.dispatch;
  if (!dispatch) {
    reasons.push({ severity: "warning", text: "Rank dispatch: backlog collection unavailable." });
  } else if (dispatch.expiredClaims > 0 || dispatch.overdueQueued > 0) {
    reasons.push({
      severity: "warning",
      text: `Rank dispatch: ${dispatchLine(database, now)} - inspect dispatcher history and recovery; worker liveness does not prove progress.`,
    });
  }
  const schedule = database.schedule;
  if (schedule.tracked > 0 && schedule.activeSchedules === 0) {
    reasons.push({
      severity: "warning",
      text: `Rank checks: no automatic schedule is active for ${schedule.tracked} runnable keyword${schedule.tracked === 1 ? "" : "s"}. Set an automatic keyword schedule.`,
    });
  }
  if (schedule.plannedOverdue > 0) {
    const runs = countLine(schedule.plannedOverdue, "planned run", null, now);
    const age = schedule.oldestPlannedFor
      ? ` (oldest ${relativeTime(schedule.oldestPlannedFor, now)})`
      : "";
    reasons.push({
      severity: "warning",
      text: `Rank planning: ${runs} past the 15 min grace${age} - inspect the planner and admission results.`,
    });
  }
  return reasons;
}

export function rankScheduleLine(database: DatabaseHeartbeat) {
  if (!database.collectionAvailable) return "Unavailable - rank schedules were not evaluated";
  const schedule = database.schedule;
  return [
    countWithNoun(schedule.activeSchedules, "active schedule"),
    countWithNoun(schedule.activeScheduledKeywords, "scheduled runnable keyword"),
    countWithNoun(schedule.plannedOverdue, "overdue planned run"),
  ].join(" · ");
}
