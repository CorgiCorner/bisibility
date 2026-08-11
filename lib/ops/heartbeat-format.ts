import type { TemporalCounterReadState } from "@/lib/ops/heartbeat-counter-state";
import type { DatabaseHeartbeat } from "@/lib/ops/heartbeat-data";
import { scheduleBreakdownText } from "@/lib/ops/heartbeat-schedule-breakdown";
import type { TemporalHeartbeat, TemporalScheduleIssue } from "@/lib/ops/heartbeat-temporal";
import {
  isLikelyMisconfigured,
  relativeTime,
  trafficCounts,
  trafficLines,
} from "@/lib/ops/heartbeat-traffic-format";
import { buildFailureBreakdown } from "@/lib/ops/instance-admin-health";
import type { OpsEventInput, OpsSeverity } from "@/lib/ops/slack";

type SweepSummary = { attempted: number; delivered: number };
type Reason = { severity: Exclude<OpsSeverity, "info">; text: string };

export type HeartbeatEventInput = {
  database: DatabaseHeartbeat;
  now: Date;
  temporalCounterState: TemporalCounterReadState;
  schedulesEnabled: Record<string, boolean>;
  suppressed: Record<string, number>;
  sweep: SweepSummary;
  temporal: TemporalHeartbeat;
  workerStartedAt: Date;
};

const HOUR_MS = 60 * 60 * 1000;
const TRAFFIC_SCHEDULE_ID = "maintenance-traffic-sync";

function duration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
}

function restartTime(value: Date) {
  return `${value.toISOString().slice(11, 16)} UTC`;
}

function isTransient(issue: TemporalScheduleIssue, workerStartedAt: Date) {
  if (!issue.gapAt || !issue.recoveredAt) return false;
  return Math.abs(Date.parse(issue.gapAt) - workerStartedAt.getTime()) <= HOUR_MS;
}

function transientIssues(input: HeartbeatEventInput) {
  return input.temporal.scheduleIssues.filter((issue) => isTransient(issue, input.workerStartedAt));
}

function activeTemporalCounts(input: HeartbeatEventInput) {
  if (input.temporalCounterState.status !== "available") return { missed: 0, overlap: 0 };
  const previous = input.temporalCounterState.totals;
  const transient = transientIssues(input);
  return {
    missed: Math.max(
      0,
      input.temporal.missedCatchupTotal -
        previous.missedCatchup -
        transient.reduce((total, issue) => total + issue.missedCatchup, 0),
    ),
    overlap: Math.max(
      0,
      input.temporal.skippedOverlapTotal -
        previous.skippedOverlap -
        transient.reduce((total, issue) => total + issue.skippedOverlap, 0),
    ),
  };
}

function trafficReason(input: HeartbeatEventInput): Reason | null {
  const counts = trafficCounts(input.database.traffic);
  const unhealthy = counts.needsReauth + counts.notRun + counts.stale + counts.failed;
  if (unhealthy === 0) return null;
  const state = `${counts.needsReauth} needs reauth, ${counts.notRun} not run, ${counts.stale} stale, ${counts.failed} failed`;
  if (counts.notRun > 0 && !input.schedulesEnabled[TRAFFIC_SCHEDULE_ID]) {
    return {
      severity: "warning",
      text: `Traffic sync: ${state} - schedule disabled (TRAFFIC_SYNC_SCHEDULE_ENABLED unset); enable it on the worker.`,
    };
  }
  const hasOperationalFailure = input.database.traffic.some(
    (row) =>
      row.status === "failed" &&
      !isLikelyMisconfigured(row) &&
      (row.failureEscalated || row.errorClass === "provider_4xx"),
  );
  return {
    severity: hasOperationalFailure ? "error" : "warning",
    text: `Traffic sync: ${state} - schedule enabled but no successful run; inspect ${TRAFFIC_SCHEDULE_ID} and provider credentials.`,
  };
}

export function heartbeatVerdict(input: HeartbeatEventInput): {
  reasons: Reason[];
  severity: OpsSeverity;
} {
  const reasons: Reason[] = [];
  const rank = input.database.rank;
  const traffic = trafficReason(input);
  if (traffic) reasons.push(traffic);
  if (input.database.schedule.tracked > 0 && input.database.schedule.active === 0) {
    reasons.push({
      severity: "warning",
      text: `Rank checks: no automatic schedule is active for ${input.database.schedule.tracked} tracked keyword${input.database.schedule.tracked === 1 ? "" : "s"}. Set an automatic keyword schedule.`,
    });
  }
  if (input.database.schedule.dueWithoutRun > 0) {
    const count = input.database.schedule.dueWithoutRun;
    reasons.push({
      severity: "error",
      text: `Rank checks: ${count} automatic schedule${count === 1 ? "" : "s"} became due in 24 h but no scheduled run executed - inspect the rank-check reconciler and worker queue.`,
    });
  }
  if (rank.failed > 0) {
    const examples = rank.topFailures.slice(0, 3).join(", ");
    reasons.push({
      severity: "error",
      text: `Rank checks: ${rank.failed} failed in 24 h${examples ? ` (${examples})` : ""} - inspect Checks and provider errors.`,
    });
  }
  if (rank.deferred > 0) {
    reasons.push({
      severity: "warning",
      text: `Rank checks: ${rank.deferred} deferred - review provider limits and the project budget.`,
    });
  }
  const fallbacks = rank.recentFallbacks ?? [];
  if (fallbacks.length > 0) {
    const top = buildFailureBreakdown(fallbacks).groups[0];
    const detail = top ? ` - top: ${top.provider} (${top.errorSummary})` : "";
    reasons.push({
      severity: "warning",
      text: `Rank checks: ${fallbacks.length} provider fallback${fallbacks.length === 1 ? "" : "s"} recorded${detail}.`,
    });
  }
  if (rank.stuck > 0) {
    reasons.push({
      severity: "error",
      text: `Rank checks: ${rank.stuck} stuck - inspect Checks and the worker queue.`,
    });
  }
  if (input.database.undeliveredEvents > 0) {
    reasons.push({
      severity: "error",
      text: `Ops delivery: ${input.database.undeliveredEvents} events undelivered - check Slack and Redis, then run the outbox sweep.`,
    });
  }
  if (input.database.bootstrapErrors.length > 0) {
    const count = input.database.bootstrapErrors.length;
    reasons.push({
      severity: "error",
      text: `Schedule bootstrap: ${count} error${count === 1 ? "" : "s"} - inspect worker startup logs.`,
    });
  }
  if (input.temporal.inspectionErrors > 0) {
    reasons.push({
      severity: "error",
      text: `Temporal: ${input.temporal.inspectionErrors} schedule inspection errors - check Temporal connectivity.`,
    });
  }
  if (input.temporalCounterState.status === "unavailable") {
    reasons.push({
      severity: "warning",
      text: "Temporal counters unavailable - missed-catchup growth could not be evaluated; check Redis connectivity.",
    });
  }
  const temporal = activeTemporalCounts(input);
  if (temporal.missed > 0 || temporal.overlap > 0) {
    const nonTransient = input.temporal.scheduleIssues.filter(
      (issue) => !isTransient(issue, input.workerStartedAt),
    );
    const breakdown = scheduleBreakdownText(nonTransient, input.temporalCounterState);
    const detail = breakdown ? `: ${breakdown}` : "";
    reasons.push({
      severity: "warning",
      text: `Temporal: ${temporal.missed} new missed catchup and ${temporal.overlap} new skipped overlap since the previous digest - inspect affected schedules${detail}.`,
    });
  }
  const suppressed = Object.values(input.suppressed).reduce((total, count) => total + count, 0);
  if (suppressed > 0) {
    reasons.push({
      severity: "warning",
      text: `Notifications: ${suppressed} suppressed - review throttle settings if this persists.`,
    });
  }
  return {
    reasons,
    severity: reasons.some((reason) => reason.severity === "error")
      ? "error"
      : reasons.length > 0
        ? "warning"
        : "info",
  };
}

function verdictTitle(reasons: Reason[]) {
  if (reasons.length === 0) return "bisibility daily digest - all healthy";
  const warnings = reasons.filter((reason) => reason.severity === "warning").length;
  const errors = reasons.length - warnings;
  const parts = [warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"}` : null];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  return `bisibility daily digest - ${parts.filter(Boolean).join(", ")}`;
}

function transientLine(input: HeartbeatEventInput) {
  const issues = transientIssues(input);
  if (issues.length === 0) return null;
  const missed = issues.reduce((total, issue) => total + issue.missedCatchup, 0);
  const overlap = issues.reduce((total, issue) => total + issue.skippedOverlap, 0);
  return `Worker restart at ${restartTime(input.workerStartedAt)}: ${missed} missed catchup, ${overlap} skipped overlap - recovered, schedules running.`;
}

function rankLine(database: DatabaseHeartbeat) {
  const rank = database.rank;
  return `Scheduled ${rank.scheduled} · succeeded ${rank.succeeded} · failed ${rank.failed} · deferred ${rank.deferred} · stuck ${rank.stuck}`;
}

function healthyLine(input: HeartbeatEventInput) {
  const parts = [`worker up ${relativeTime(input.workerStartedAt, input.now).replace(" ago", "")}`];
  if (input.database.undeliveredEvents === 0) parts.push("ops outbox clear");
  if (input.database.rank.failed === 0 && input.database.rank.stuck === 0)
    parts.push("rank checks: no failures");
  if (input.database.bootstrapErrors.length === 0 && input.temporal.inspectionErrors === 0) {
    parts.push("no bootstrap errors");
  }
  return parts.join(" · ");
}

function temporalCounterLine(input: HeartbeatEventInput) {
  if (input.temporalCounterState.status === "unavailable") {
    return "Counters unavailable · missed-catchup delta not evaluated";
  }
  const current = {
    missedCatchup: input.temporal.missedCatchupTotal,
    skippedOverlap: input.temporal.skippedOverlapTotal,
  };
  if (current.missedCatchup === 0 && current.skippedOverlap === 0) return null;
  const totals = `${current.missedCatchup} missed catchup · ${current.skippedOverlap} skipped overlap`;
  if (input.temporalCounterState.status === "missing") return `${totals} · baseline established`;
  const previous = input.temporalCounterState.totals;
  if (
    current.missedCatchup <= previous.missedCatchup &&
    current.skippedOverlap <= previous.skippedOverlap
  ) {
    return `${totals} · unchanged since previous digest`;
  }
  return `${totals} · compared with previous digest`;
}

export function buildHeartbeatEvent(input: HeartbeatEventInput): OpsEventInput {
  const verdict = heartbeatVerdict(input);
  const transient = transientLine(input);
  const fields: Record<string, string> = {};
  if (verdict.reasons.length > 0) {
    fields["Needs attention"] = verdict.reasons.map((reason) => reason.text).join("\n");
  }
  if (transient) fields.Transient = transient;
  fields["Rank checks (24h)"] = rankLine(input.database);
  if (input.database.rank.lagP50Ms !== null && input.database.rank.lagP95Ms !== null) {
    fields["Start lag"] =
      `p50 ${duration(input.database.rank.lagP50Ms)} · p95 ${duration(input.database.rank.lagP95Ms)}`;
  }
  fields.Traffic = trafficLines(input.database, input.now);
  const next = input.temporal.nextActionAt
    ? relativeTime(input.temporal.nextActionAt, input.now)
    : "not scheduled";
  fields.Schedules = `${input.temporal.schedules} inspected · ${input.temporal.recentActions} actions in 24 h · next ${next}`;
  const counters = temporalCounterLine(input);
  if (counters) fields["Temporal counters"] = counters;
  fields.Healthy = healthyLine(input);
  return {
    fields,
    kind: "heartbeat",
    severity: verdict.severity,
    title: verdictTitle(verdict.reasons),
  };
}
