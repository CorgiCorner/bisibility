import { alertPositionThreshold } from "@/lib/alerts/depth-conflict";
import { comparableCompletedWindow } from "@/lib/checks/status";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import { earlierDayPosition, positionDateLabel } from "@/lib/keywords/position-history";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { type KeywordLocation, locationView } from "./keyword-location";
import type { Metrics } from "./keyword-metrics";
import { deviceLabel, pathFromUrl } from "./keyword-row-format";
import type {
  KeywordCheckState,
  KeywordRow,
  KeywordSchedule,
  KeywordTrafficSummary,
  LastCheckStatus,
  UrlPresenceView,
} from "./keyword-row-types";

export type {
  KeywordCheckState,
  KeywordRow,
  KeywordSchedule,
  KeywordTrafficSummary,
  LastCheckStatus,
  PositionPoint,
  RankingUrlEvent,
  UrlPresenceView,
} from "./keyword-row-types";

type ScheduleSource = {
  cronExpression: string | null;
  frequency: KeywordSchedule["frequency"];
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  serpDepth?: number | null;
  timezone: string;
};

type KeywordProject = { defaults: ScheduleSource | null; domain: string };
type UrlPresenceSource = {
  canonicalOk: boolean | null;
  checkedAt: Date;
  coverageState: string | null;
  lastCrawlAt: Date | null;
  url: string;
  verdict: string | null;
};

type KeywordRowInput = {
  alertTargets?: {
    rule: {
      conditionType: string;
      enabled: boolean;
      thresholdPosition: number | null;
      topN: number | null;
      updatedAt: Date;
    };
  }[];
  createdAt: Date;
  device: string;
  id: string;
  intent: string | null;
  location: string;
  locationRef?: {
    canonicalKey: string;
    cityName: string | null;
    countryCode: string;
    displayName: string;
    gl: string;
    hl: string;
    id: string;
    kind: KeywordLocation["kind"];
  } | null;
  publicId: string;
  rankChecks: {
    checkedAt: Date;
    id: string;
    normalizationVersion: string | null;
    position: number | null;
    previousPosition: number | null;
    rankingUrl: string | null;
    requestedDepth: number | null;
    status?: string;
  }[];
  schedule: ScheduleSource | null;
  tags: { tag: { name: string } }[];
  targetUrl: string | null;
  text: string;
  topic: string | null;
  urlPresence?: UrlPresenceSource | null;
};

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

function urlPresenceView(presence: UrlPresenceSource | null | undefined): UrlPresenceView | null {
  return presence
    ? {
        canonicalOk: presence.canonicalOk,
        checkedAt: presence.checkedAt.toISOString(),
        coverageState: presence.coverageState,
        indexed: presence.verdict === "PASS",
        lastCrawlAt: iso(presence.lastCrawlAt),
        url: presence.url,
        verdict: presence.verdict,
      }
    : null;
}

export function isCompletedCheck(check: { status?: string }) {
  return check.status === undefined || check.status === "completed";
}

export function latestStatus(check: { status?: string } | null): LastCheckStatus {
  if (!check) return null;
  if (check.status === "failed" || check.status === "running") return check.status;
  return check.status === undefined || check.status === "completed" ? "completed" : null;
}

export function keywordCheckState(
  check: { position: number | null; status?: string } | null,
): KeywordCheckState {
  if (!check) return "never_checked";
  if (check.status === "running") return "running";
  if (check.status === "failed") return "failed";
  if (check.status && check.status !== "completed") return "never_checked";
  return check.position === null ? "not_ranked" : "ranked";
}

export function mapKeyword(
  row: KeywordRowInput,
  project: KeywordProject,
  metrics: Metrics,
  traffic?: KeywordTrafficSummary,
) {
  const visibleChecks = row.rankChecks.filter((check) => check.status !== "deferred");
  const comparableWindow = comparableCompletedWindow(visibleChecks);
  const completedChecks = comparableWindow.checks;
  const checks = completedChecks.slice().reverse();
  const latest = completedChecks[0];
  const latestAttempt = visibleChecks[0] ?? null;
  const projectSerpDepth = resolveSerpDepth(project.defaults?.serpDepth ?? undefined);
  const configuredDepth = resolveSerpDepth(row.schedule?.serpDepth ?? projectSerpDepth);
  const trackedDepth = resolveSerpDepth(latestAttempt?.requestedDepth ?? configuredDepth);
  const positions = checks.flatMap((check) => (check.position === null ? [] : [check.position]));
  const position = latest?.position ?? 101;
  const previousPosition = latest?.previousPosition ?? null;
  const positionBaseline = earlierDayPosition(completedChecks, latest);
  const rankingUrl = latest?.rankingUrl ?? null;
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

  return {
    bestPosition: positions.length ? Math.min(...positions) : null,
    clicks: traffic?.clicks ?? null,
    cpc: metrics.cpc === null ? "0.00" : metrics.cpc.toFixed(2),
    cpcKnown: metrics.cpc !== null,
    createdAt: row.createdAt.toISOString(),
    ctr: traffic?.ctr ?? null,
    device: deviceLabel(row.device),
    difficulty: metrics.difficulty ?? 0,
    difficultyKnown: metrics.difficulty !== null,
    engine: "Google",
    checkState: keywordCheckState(latestAttempt),
    hasRankData: Boolean(latest),
    id: row.publicId,
    impressions: traffic?.impressions ?? null,
    keyword: row.text,
    lastCheckAt: iso(latestAttempt?.checkedAt) ?? schedule.last_checked_at,
    lastCheckStatus: latestStatus(latestAttempt),
    location: locationView(row),
    locationName: row.location,
    position,
    positionBaseline,
    positionHistoryBoundaryAt: iso(comparableWindow.boundary?.checkedAt),
    positionHistory: checks.flatMap((check) =>
      check.position === null
        ? []
        : [
            {
              checkedAt: check.checkedAt.toISOString(),
              label: positionDateLabel(check.checkedAt),
              position: check.position,
            },
          ],
    ),
    projectSerpDepth,
    previousPosition,
    rankingPages: new Set(rankingUrls).size,
    rankingPath: rankingUrl ? pathFromUrl(rankingUrl) : null,
    rankingUrl,
    rankingUrlHistory: checks
      .filter((check) => check.rankingUrl)
      .map((check) => ({
        date: positionDateLabel(check.checkedAt),
        note: check.id === latest?.id ? "Current ranking URL" : "Observed ranking URL",
        position: check.position ?? 0,
        url: check.rankingUrl ?? "",
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
