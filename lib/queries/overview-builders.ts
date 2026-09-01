import { comparableCompletedWindow } from "@/lib/checks/status";
import { relativePast } from "@/lib/format/relative-time";
import { notRankedLabel, rankObservationState } from "@/lib/serp/rank-depth";
import { rankBucketColors } from "@/lib/theme/chart-colors";
import type { Keyword } from "./overview-trend";
import { summarizeVisibility, visibilitySnapshotFor } from "./visibility";

export type { Check, Keyword, Trend } from "./overview-trend";
export { buildTrend, buildTrendTakeaway } from "./overview-trend";

export type Tone = "positive" | "negative" | "neutral";
export type Kpi = {
  delta: string;
  deltaAction?: "check_runs";
  deltaTone: Tone;
  label: string;
  value: string;
};
export type Bucket = { color: string; count: number; label: string };
export type MetricDistributionBucket = { count: number | null; max: number; min: number };
export type OverviewMetrics = {
  averagePosition: number | null;
  averagePositionDelta: number | null;
  positionDistribution: MetricDistributionBucket[];
  top3Count: number | null;
  top10Count: number | null;
  top10Delta: number | null;
  top100Count: number | null;
  visibility: number | null;
  visibilityMeasuredKeywordCount: number;
  visibilityDelta: number | null;
};
// biome-ignore format: compact query-local shapes keep this file under the line cap.
export type HighlightRow = { delta?: { direction: "down" | "up"; title: string; value: string }; device?: string; id: string; keyword: string; marketLanguageLabel?: string; marketLocationLabel?: string; note: string; positionText: string; positionTone?: "danger" | "default" | "muted" };
// biome-ignore format: compact query-local shapes keep this file under the line cap.
export type HighlightList = { kind: "attention" | "newTop10" | "recentlyAdded" | "wins"; rows: HighlightRow[]; subtitle: string; title: string };
export type Snapshot = ReturnType<typeof snapshotFor>;

export const buckets = [
  ["#1-3", 1, 3],
  ["#4-10", 4, 10],
  ["#11-20", 11, 20],
  ["#21-50", 21, 50],
  ["#51-100", 51, 100],
] as const;

export const avg = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export const pos = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 && value <= 100 ? value : null;
export const tone = (value: number): Tone => {
  if (value > 0) return "positive";
  return value < 0 ? "negative" : "neutral";
};

function averageDeltaCopy(hasData: boolean, averageDelta: number) {
  if (!hasData) return "awaiting first check";
  if (!averageDelta) return "0";
  const direction = averageDelta > 0 ? "up" : "down";
  return `${direction} ${Math.abs(averageDelta).toFixed(1)}`;
}

export function snapshotFor(keyword: Keyword, volume: number | null = null) {
  const latestAttempt = keyword.rankChecks[0] ?? null;
  const comparableChecks = comparableCompletedWindow(keyword.rankChecks).checks;
  const latest = comparableChecks.find((check) => pos(check.position)) ?? null;
  const current = pos(latest?.position);
  // Compare only with a genuine earlier positive check in the selected window.
  // Stored previousPosition may refer to a check outside that window.
  const latestIndex = latest ? comparableChecks.indexOf(latest) : -1;
  const previous =
    latestIndex < 0
      ? null
      : (comparableChecks
          .slice(latestIndex + 1)
          .map((check) => pos(check.position))
          .find(Boolean) ?? null);

  return {
    keyword,
    latest,
    latestAttempt,
    movement: current && previous ? previous - current : null,
    position: current,
    previous,
    volume,
  };
}

export function delta(current: number | null, previous: number | null) {
  if (!current || !previous || current === previous) return undefined;
  const gained = previous - current;
  return {
    direction: gained > 0 ? "up" : "down",
    title: gained > 0 ? `Up ${gained}` : `Down ${Math.abs(gained)}`,
    value: String(Math.abs(gained)),
  } as const;
}

export function rowFor(snapshot: Snapshot, note?: string, showDelta = true): HighlightRow {
  const observation = rankObservationState({
    completedChecks: snapshot.latestAttempt?.status === "completed" ? 1 : 0,
    position: snapshot.latestAttempt?.position,
  });
  return {
    ...(showDelta ? { delta: delta(snapshot.position, snapshot.previous) } : {}),
    device: snapshot.keyword.device,
    id: snapshot.keyword.publicId,
    keyword: snapshot.keyword.text,
    marketLanguageLabel: snapshot.keyword.locationRef.languageLabel,
    marketLocationLabel: snapshot.keyword.locationRef.displayName,
    note: note ?? snapshot.latest?.rankingUrl ?? "No ranking URL observed",
    positionText: snapshot.position ? `#${snapshot.position}` : observation.label,
    positionTone: snapshot.position ? "default" : "muted",
  };
}

export function list(
  kind: HighlightList["kind"],
  title: string,
  subtitle: string,
  rows: HighlightRow[],
) {
  return { kind, rows, subtitle, title };
}

export function buildDistribution(positions: number[]): Bucket[] {
  return buckets.map(([label, min, max], index) => ({
    color: rankBucketColors.at(index) ?? rankBucketColors[0],
    count: positions.filter((value) => value >= min && value <= max).length,
    label,
  }));
}

// biome-ignore format: dense aggregation keeps this file under the project line cap.
export function buildHighlights(snapshots: Snapshot[], now: Date): HighlightList[] {
  const byGain = [...snapshots].sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0));
  const note = (item: Snapshot, verb: string) => `${verb} ${Math.abs(item.movement ?? 0)} - ${item.latest?.rankingUrl ?? "No ranking URL observed"}`;
  const successfulLatest = (item: Snapshot) => item.latestAttempt?.status === "completed" && Boolean(pos(item.latestAttempt.position));
  const wins = byGain.filter((item) => (item.movement ?? 0) > 0 && successfulLatest(item)).slice(0, 4).map((item) => rowFor(item, note(item, "Gained")));
  const failures = snapshots.filter((item) => item.latestAttempt?.status === "failed").map((item) => ({
    ...rowFor(item, undefined, false), note: "Latest check failed", positionText: "No data", positionTone: "danger" as const,
  }));
  const outsideTop100 = snapshots.filter((item) => item.latestAttempt?.status === "completed" && !pos(item.latestAttempt.position)).map((item) => ({
    ...rowFor(item, undefined, false), note: `Latest check completed - ${notRankedLabel().toLowerCase()}`, positionText: notRankedLabel(), positionTone: "muted" as const,
  }));
  const drops = byGain.filter((item) => (item.movement ?? 0) < 0 && successfulLatest(item)).reverse().map((item) => rowFor(item, note(item, "Dropped")));
  const top10 = snapshots
    .filter((item) => successfulLatest(item) && item.position && item.position <= 10 && (item.previous === null || item.previous > 10))
    .sort((a, b) => (a.position ?? 101) - (b.position ?? 101)).slice(0, 4)
    .map((item) => rowFor(item, `Entered top 10 - ${item.latest?.rankingUrl ?? "No ranking URL observed"}`));
  const recentCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentlyAdded = snapshots
    .filter((item) => item.keyword.createdAt.getTime() >= recentCutoff && item.keyword.createdAt.getTime() <= now.getTime())
    .sort((a, b) => b.keyword.createdAt.getTime() - a.keyword.createdAt.getTime()).slice(0, 4)
    .map((item) => {
      const observation = rankObservationState({
        completedChecks: item.latestAttempt?.status === "completed" ? 1 : 0,
        position: item.latestAttempt?.position,
      });
      const checkState = observation.kind === "not_ranked"
        ? ` · Checked - ${observation.label.toLowerCase()}`
        : item.latest
          ? ` · ${item.latest.rankingUrl ?? "No ranking URL observed"}`
          : " · first check pending";
      return rowFor(item, `Added ${relativePast(item.keyword.createdAt, now)}${checkState}`);
    });
  return [
    list("wins", "Biggest wins", "Gained the most positions", wins),
    list("attention", "Needs attention", "Dropped, outside top 100, or failed checks", [...failures, ...outsideTop100, ...drops].slice(0, 4)),
    list("newTop10", "New in top 10", "Now ranking on page one", top10),
    list("recentlyAdded", "Recently added", "Added in the last 7 days", recentlyAdded),
  ];
}

export function kpi(label: string, value: string, delta: string, deltaTone: Tone = "neutral"): Kpi {
  return { delta, deltaTone, label, value };
}

function percentagePointCopy(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

export function buildOverviewMetrics(snapshots: Snapshot[]): OverviewMetrics {
  const positions = snapshots.flatMap((item) => (item.position ? [item.position] : []));
  const comparable = snapshots.filter((item) => item.position && item.previous);
  const currentComparable = comparable.map((item) => item.position as number);
  const previous = comparable.map((item) => item.previous as number);
  const hasCompletedChecks = snapshots.some((item) =>
    item.keyword.rankChecks.some((check) => check.status === "completed"),
  );
  const countAt = (limit: number, values = positions) =>
    values.filter((value) => value <= limit).length;
  const averagePositionDelta = comparable.length ? avg(previous) - avg(currentComparable) : null;
  const visibility = summarizeVisibility(
    snapshots.map((snapshot) => visibilitySnapshotFor(snapshot.keyword, snapshot.volume)),
  );

  return {
    averagePosition: positions.length ? avg(positions) : null,
    averagePositionDelta,
    positionDistribution: buckets.map(([, min, max]) => ({
      count: hasCompletedChecks
        ? positions.filter((position) => position >= min && position <= max).length
        : null,
      max,
      min,
    })),
    top3Count: hasCompletedChecks ? countAt(3) : null,
    top10Count: hasCompletedChecks ? countAt(10) : null,
    top10Delta: comparable.length ? countAt(10, currentComparable) - countAt(10, previous) : null,
    top100Count: hasCompletedChecks ? positions.length : null,
    visibility: visibility.value,
    visibilityDelta: visibility.delta,
    visibilityMeasuredKeywordCount: visibility.measuredKeywordCount,
  };
}

// biome-ignore format: dense KPI construction keeps this file under the project line cap.
export function buildKpis(
  snapshots: Snapshot[],
  keywordCount: number,
  addedThisMonth: number,
  metrics = buildOverviewMetrics(snapshots),
): Kpi[] {
  const hasCompletedChecks = snapshots.some((item) =>
    item.keyword.rankChecks.some((check) => check.status === "completed"),
  );
  const hasFailedChecks = snapshots.some((item) =>
    item.keyword.rankChecks.some((check) => check.status === "failed"),
  );
  const hasPositionData = metrics.averagePosition !== null;
  const hasComparison = metrics.averagePositionDelta !== null;
  const averageDelta = metrics.averagePositionDelta ?? 0;
  const countDelta = (value: number) => (value > 0 ? `+${value}` : String(value));
  const waitingCopy = hasFailedChecks ? "first check failed" : "awaiting first check";
  const waitingTone = hasFailedChecks ? "negative" : "neutral";
  const waitingAction = hasFailedChecks ? "check_runs" : undefined;
  const waitingKpi = (label: string, value: string): Kpi => ({
    delta: waitingCopy,
    ...(waitingAction ? { deltaAction: waitingAction } : {}),
    deltaTone: waitingTone,
    label,
    value,
  });
  const averageCopy = hasPositionData
    ? hasComparison
      ? `${averageDeltaCopy(true, averageDelta)} vs previous ranked check`
      : "new"
    : "no ranked positions";
  const topDeltaCopy = hasComparison ? countDelta(metrics.top10Delta ?? 0) : "new";
  const visibilityDelta = metrics.visibilityDelta ?? 0;
  if (!hasCompletedChecks) {
    return [
      waitingKpi("Avg. position", "-"),
      kpi("Tracked keywords", String(keywordCount), addedThisMonth ? `+${addedThisMonth} this month` : "no new this month"),
      waitingKpi("In top 10", "-"),
      waitingKpi("Visibility", "–"),
    ];
  }
  const visibilityKpi =
    metrics.visibility === null
      ? {
          ...waitingKpi("Visibility", "–"),
          delta: hasFailedChecks ? waitingCopy : "awaiting Top 20 check",
        }
      : kpi(
          "Visibility",
          `${Math.round(metrics.visibility)}%`,
          metrics.visibilityDelta === null ? "new" : percentagePointCopy(visibilityDelta),
          tone(visibilityDelta),
        );
  return [
    kpi("Avg. position", hasPositionData ? metrics.averagePosition?.toFixed(1) ?? "-" : "-", averageCopy, tone(averageDelta)),
    kpi("Tracked keywords", String(keywordCount), addedThisMonth ? `+${addedThisMonth} this month` : "no new this month"),
    kpi("In top 10", String(metrics.top10Count ?? 0), topDeltaCopy, tone(metrics.top10Delta ?? 0)),
    visibilityKpi,
  ];
}
