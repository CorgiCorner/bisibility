import type { TemporalCounterReadState } from "@/lib/ops/heartbeat-counter-state";
import type { TemporalScheduleIssue } from "@/lib/ops/heartbeat-temporal";

export type ScheduleDelta = {
  newMissed: number;
  newSkipped: number;
  scheduleId: string;
};

const MAX_ROWS = 5;

/**
 * Lifetime counters use clamped baseline deltas; legacy entries without baselines stay lifetime.
 */
export function scheduleDeltas(
  issues: TemporalScheduleIssue[],
  state: TemporalCounterReadState,
): { deltas: ScheduleDelta[]; lifetime: boolean } {
  const perSchedule = state.status === "available" ? state.perSchedule : undefined;
  const deltas = issues
    .map((issue) => {
      const previous = perSchedule?.[issue.scheduleId];
      return {
        newMissed: Math.max(0, issue.missedCatchup - (previous?.missedCatchup ?? 0)),
        newSkipped: Math.max(0, issue.skippedOverlap - (previous?.skippedOverlap ?? 0)),
        scheduleId: issue.scheduleId,
      };
    })
    .filter((delta) => delta.newMissed > 0 || delta.newSkipped > 0)
    .sort((left, right) => right.newMissed - left.newMissed || right.newSkipped - left.newSkipped);
  return { deltas, lifetime: perSchedule === undefined };
}

function formatDelta(delta: ScheduleDelta) {
  const skipped = delta.newSkipped > 0 ? ` (+${delta.newSkipped} skipped)` : "";
  return `${delta.scheduleId} +${delta.newMissed}${skipped}`;
}

/** Compact "id +N, id +M" attribution: top 5 by new missed then "+K more". Empty when nothing to attribute. */
export function scheduleBreakdownText(
  issues: TemporalScheduleIssue[],
  state: TemporalCounterReadState,
): string {
  const { deltas, lifetime } = scheduleDeltas(issues, state);
  if (deltas.length === 0) return "";
  const shown = deltas.slice(0, MAX_ROWS).map(formatDelta);
  const remainder = deltas.length - shown.length;
  const list = remainder > 0 ? `${shown.join(", ")}, +${remainder} more` : shown.join(", ");
  return lifetime ? `${list} (lifetime totals; per-schedule baseline not yet recorded)` : list;
}
