import { keywordCheckState } from "./keyword-check-state";

export { keywordCheckState } from "./keyword-check-state";

import { alertPositionThreshold } from "@/lib/alerts/depth-conflict";
import { positionObservations } from "@/lib/checks/position-observations";
import { comparableCompletedWindow } from "@/lib/checks/status";
import { deriveRankingUrlPeriods } from "@/lib/keyword-detail/ranking-url-history";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import { locationView } from "@/lib/queries/keyword-location";
import type { Metrics } from "@/lib/queries/keyword-metrics";
import { deviceLabel, pathFromUrl } from "@/lib/queries/keyword-row-format";
import { comparablePositionPoints, urlPresenceView } from "@/lib/queries/keyword-row-history";
import type {
  KeywordRow,
  KeywordSchedule,
  KeywordTrafficSummary,
  LastCheckStatus,
  LatestAttemptHealth,
} from "@/lib/queries/keyword-row-types";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { resolveRecordedChecks } from "@/lib/rank-measurements/check-resolution";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { normalizedObservationCompleteness } from "@/lib/serp/rank-depth";

export type {
  CompletedComparableCheck,
  KeywordCheckSchedule,
  KeywordCheckState,
  KeywordRow,
  KeywordSchedule,
  KeywordTrafficSummary,
  LastCheckStatus,
  LatestAttemptHealth,
  PositionPoint,
  RankingUrlEvent,
  UrlPresenceView,
} from "@/lib/queries/keyword-row-types";

import type { KeywordProject, KeywordRowInput, ScheduleSource } from "./keyword-row-input";

export type { KeywordRowInput } from "./keyword-row-input";
export function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}
export function scheduleView(
  schedule: ScheduleSource,
  nextCheckAt = schedule.nextCheckAt,
): KeywordSchedule {
  return {
    cron_expression: schedule.cronExpression,
    frequency: schedule.frequency,
    jitter_minutes: schedule.jitterMinutes,
    last_checked_at: iso(schedule.lastCheckedAt),
    next_check_at: iso(nextCheckAt),
    serp_depth: schedule.serpDepth == null ? null : resolveSerpDepth(schedule.serpDepth),
    timezone: schedule.timezone,
  };
}
export function fallbackSchedule(): KeywordSchedule {
  return {
    cron_expression: null,
    frequency: "manual",
    jitter_minutes: 0,
    last_checked_at: null,
    next_check_at: null,
    serp_depth: null,
    timezone: "UTC",
  };
}
export function isCompletedCheck(check: { status?: string }) {
  return check.status === undefined || check.status === "completed";
}
export function latestStatus(check: { status?: string } | null): LastCheckStatus {
  if (!check) return null;
  if (check.status === "failed" || check.status === "running") return check.status;
  return check.status === undefined || check.status === "completed" ? "completed" : null;
}
export function latestAttemptHealth(
  check: { status?: string } | null,
  queuedTasks: ReadonlyArray<{ state: string }>,
): LatestAttemptHealth {
  if (check?.status === "running") return "running";
  if (queuedTasks.some((task) => ACTIVE_QUEUED_TASK_STATES.includes(task.state))) return "running";
  return check?.status === "failed" ? "failed" : "ok";
}
export function mapKeyword(
  row: KeywordRowInput,
  project: KeywordProject,
  metrics: Metrics,
  traffic?: KeywordTrafficSummary,
) {
  const visibleChecks = row.rankChecks.filter((check) => check.status !== "deferred");
  const quality = resolveRecordedChecks(visibleChecks, row.id);
  const comparableWindow = comparableCompletedWindow(visibleChecks);
  const completedChecks = comparableWindow.checks;
  const completedUrlHistory = visibleChecks.filter(isCompletedCheck);
  const checks = completedChecks.slice().reverse();
  const latest = completedUrlHistory[0];
  const latestAttempt = visibleChecks[0] ?? null;
  const projectSerpDepth = resolveSerpDepth(project.defaults?.serpDepth ?? undefined);
  const configuredDepth = resolveSerpDepth(row.schedule?.serpDepth ?? projectSerpDepth);
  const trackedDepth = resolveSerpDepth(latest?.requestedDepth ?? configuredDepth);
  const positions = checks.flatMap((check) => (check.position === null ? [] : [check.position]));
  const position = latest?.position ?? 101;
  const previousPosition = quality.movement !== null ? (quality.baseline?.position ?? null) : null;
  const positionBaseline = previousPosition;
  const rankingUrl = latest?.rankingUrl ?? null;
  const expectedUrlAtCheck = latest?.expectedUrlAtCheck ?? null;
  const currentExpectedUrl = row.expectedUrlResolution?.url ?? row.targetUrl;
  const expectedUrl = expectedUrlAtCheck ?? currentExpectedUrl;
  const expectedUrlFallbackCurrent = Boolean(latest && !expectedUrlAtCheck && expectedUrl);
  const rankingUrls = checks.flatMap((check) => (check.rankingUrl ? [check.rankingUrl] : []));
  const targetPosition = row.alertTargets
    ?.filter(({ rule }) => rule.enabled)
    .sort((left, right) => right.rule.updatedAt.getTime() - left.rule.updatedAt.getTime())
    .map(({ rule }) => alertPositionThreshold(rule))
    .find((target): target is number => target !== null && target > 0);
  let scheduleSource: NonNullable<KeywordRow["scheduleSource"]> = "fallback";
  let schedule = fallbackSchedule();
  if (row.schedule) {
    scheduleSource = "keyword";
    const effective = resolveEffectiveSchedule(row.schedule, null, row.id);
    schedule = scheduleView(row.schedule, effective.nextCheckAt);
  } else if (project.defaults) {
    scheduleSource = "project";
    const effective = resolveEffectiveSchedule(null, project.defaults, row.id);
    schedule = scheduleView(project.defaults, effective.nextCheckAt);
  }

  if (row.checkSchedule?.serpDepth !== undefined) {
    schedule.serp_depth =
      row.checkSchedule.serpDepth === null ? null : resolveSerpDepth(row.checkSchedule.serpDepth);
  }

  return {
    bestPosition: positions.length ? Math.min(...positions) : null,
    clicks: traffic?.clicks ?? null,
    cpc: metrics.cpc === null ? "0.00" : metrics.cpc.toFixed(2),
    cpcKnown: metrics.cpc !== null,
    createdAt: row.createdAt.toISOString(),
    dataAsOfAt: iso(latest?.checkedAt),
    dataProvider: latest?.provider ?? null,
    ctr: traffic?.ctr ?? null,
    device: deviceLabel(row.device),
    difficulty: metrics.difficulty ?? 0,
    difficultyKnown: metrics.difficulty !== null,
    engine: "Google",
    currentExpectedUrl,
    expectedUrl,
    expectedUrlFallbackCurrent,
    expectedUrlSource: row.expectedUrlResolution?.source ?? (row.targetUrl ? "explicit" : null),
    checkState: keywordCheckState(latestAttempt, row.queuedRankCheckTasks ?? []),
    observationCompleteness: normalizedObservationCompleteness(
      latest?.observationRun?.completeness,
    ),
    checkSchedule: row.checkSchedule
      ? {
          name: row.checkSchedule.name,
          nextCheckAt: null,
          publicId: row.checkSchedule.publicId,
        }
      : null,
    completedComparableChecks: checks.slice(-2).map((check) => ({
      ...(check.observationRun
        ? {
            observationCompleteness: normalizedObservationCompleteness(
              check.observationRun.completeness,
            ),
          }
        : {}),
      checkedAt: check.checkedAt.toISOString(),
      position: check.position,
      rankingUrl: check.rankingUrl,
    })),
    hasRankData: Boolean(latest),
    hasTag: metrics.difficulty !== null,
    id: row.publicId,
    impressions: traffic?.impressions ?? null,
    keyword: row.text,
    lastCheckAt: iso(latestAttempt?.checkedAt) ?? schedule.last_checked_at,
    lastCheckErrorCode: latestAttempt?.errorCode ?? null,
    lastCheckStatus: latestStatus(latestAttempt),
    latestAttemptHealth: latestAttemptHealth(latestAttempt, row.queuedRankCheckTasks ?? []),
    location: locationView(row),
    locationName: row.location,
    position,
    positionBaseline,
    positionHistoryBoundaryAt: iso(comparableWindow.boundary?.checkedAt),
    positionObservations: positionObservations(visibleChecks),
    positionHistory: comparablePositionPoints(checks),
    projectSerpDepth,
    projectTimezone: project.defaults?.timezone ?? "UTC",
    previousPosition,
    rankingPages: new Set(rankingUrls).size,
    rankingPath: rankingUrl ? pathFromUrl(rankingUrl) : null,
    rankingUrl,
    rankingUrlHistory: deriveRankingUrlPeriods(completedUrlHistory).map((period) => ({
      ...period,
      endAt: period.endAt.toISOString(),
      startAt: period.startAt.toISOString(),
    })),
    schedule,
    scheduleSource,
    trackedDepth,
    serpFeatures: metrics.serpFeatures,
    sparkline: positions,
    tags: row.tags.map((item) => item.tag.name),
    targetPosition: targetPosition ?? null,
    targetUrl: row.targetUrl,
    urlPresence: urlPresenceView(row.urlPresence),
    topic: row.topic,
    trafficDate: traffic?.date.toISOString(),
    intent: row.intent,
    volume: metrics.volume ?? 0,
    volumeKnown: metrics.volume !== null,
  } satisfies KeywordRow;
}
