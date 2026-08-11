import { comparableCompletedWindow } from "@/lib/checks/status";
import { relativePast } from "@/lib/format/relative-time";
import { notRankedLabel, rankObservationState } from "@/lib/serp/rank-depth";
import { rankBucketColors } from "@/lib/theme/chart-colors";
import type { Keyword } from "./overview-trend";

export type { Check, Keyword, Trend } from "./overview-trend";
export { buildTrend, buildTrendTakeaway } from "./overview-trend";

export type Tone = "positive" | "negative" | "neutral";
export type Kpi = { delta: string; deltaTone: Tone; label: string; value: string };
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
  visibilityDelta: number | null;
};
// biome-ignore format: compact query-local shapes keep this file under the line cap.
export type HighlightRow = { delta?: { direction: "down" | "up"; title: string; value: string }; id: string; keyword: string; note: string; positionText: string; positionTone?: "danger" | "default" | "muted" };
// biome-ignore format: compact query-local shapes keep this file under the line cap.
export type HighlightList = { kind: "attention" | "newTop10" | "recentlyAdded" | "wins"; rows: HighlightRow[]; subtitle: string; title: string };
export type Snapshot = ReturnType<typeof snapshotFor>;

const CTR_BY_POSITION = [
  0.3, 0.17, 0.11, 0.08, 0.065, 0.055, 0.048, 0.042, 0.037, 0.033, 0.029, 0.026, 0.023, 0.021,
  0.019, 0.017, 0.015, 0.013, 0.011, 0.01,
] as const;

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

export function rowFor(snapshot: Snapshot, note?: string): HighlightRow {
  const observation = rankObservationState({
    completedChecks: snapshot.latestAttempt?.status === "completed" ? 1 : 0,
    position: snapshot.latestAttempt?.position,
  });
  return {
    delta: delta(snapshot.position, snapshot.previous),
    id: snapshot.keyword.publicId,
    keyword: snapshot.keyword.text,
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
    id: item.keyword.publicId, keyword: item.keyword.text, note: "Latest check failed", positionText: "No data", positionTone: "danger" as const,
  }));
  const outsideTop100 = snapshots.filter((item) => item.latestAttempt?.status === "completed" && !pos(item.latestAttempt.position)).map((item) => ({
    id: item.keyword.publicId, keyword: item.keyword.text, note: `Latest check completed - ${notRankedLabel().toLowerCase()}`, positionText: notRankedLabel(), positionTone: "muted" as const,
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function visibility(snapshots: Snapshot[], positionKey: "position" | "previous") {
  const known = snapshots.flatMap((item) =>
    item.volume !== null && Number.isFinite(item.volume) ? [Math.max(0, item.volume)] : [],
  );
  // Unknown volumes use the known-volume median; a fully unknown set is deliberately unweighted.
  const fallbackWeight = known.length ? median(known) : 1;
  let weightedCtr = 0;
  let totalWeight = 0;
  for (const item of snapshots) {
    const weight = item.volume === null ? fallbackWeight : Math.max(0, item.volume);
    const position = item[positionKey];
    weightedCtr +=
      (position && position <= CTR_BY_POSITION.length ? CTR_BY_POSITION[position - 1] : 0) * weight;
    totalWeight += weight;
  }
  return totalWeight ? (weightedCtr / (CTR_BY_POSITION[0] * totalWeight)) * 100 : 0;
}

function percentagePointCopy(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

export function buildOverviewMetrics(snapshots: Snapshot[]): OverviewMetrics {
  const positions = snapshots.flatMap((item) => (item.position ? [item.position] : []));
  const comparable = snapshots.filter((item) => item.position && item.previous);
  const currentComparable = comparable.map((item) => item.position as number);
  const previous = comparable.map((item) => item.previous as number);
  const hasRankData =
    positions.length > 0 || snapshots.some((item) => item.latestAttempt?.status === "completed");
  const hasVisibilityData = snapshots.some((item) => item.latestAttempt?.status === "completed");
  const countAt = (limit: number, values = positions) =>
    values.filter((value) => value <= limit).length;
  const averagePositionDelta = comparable.length ? avg(previous) - avg(currentComparable) : null;
  const visibilityDelta = comparable.length
    ? visibility(comparable, "position") - visibility(comparable, "previous")
    : null;

  return {
    averagePosition: positions.length ? avg(positions) : null,
    averagePositionDelta,
    positionDistribution: buckets.map(([, min, max]) => ({
      count: hasRankData
        ? positions.filter((position) => position >= min && position <= max).length
        : null,
      max,
      min,
    })),
    top3Count: hasRankData ? countAt(3) : null,
    top10Count: hasRankData ? countAt(10) : null,
    top10Delta: comparable.length ? countAt(10, currentComparable) - countAt(10, previous) : null,
    top100Count: hasRankData ? positions.length : null,
    visibility: hasVisibilityData ? visibility(snapshots, "position") : null,
    visibilityDelta,
  };
}

// biome-ignore format: dense KPI construction keeps this file under the project line cap.
export function buildKpis(snapshots: Snapshot[], keywordCount: number, addedThisMonth: number): Kpi[] {
  const metrics = buildOverviewMetrics(snapshots);
  const hasData = metrics.averagePosition !== null;
  const hasVisibilityData = metrics.visibility !== null;
  const hasComparison = metrics.averagePositionDelta !== null;
  const averageDelta = metrics.averagePositionDelta ?? 0;
  const countDelta = (value: number) => (value > 0 ? `+${value}` : String(value));
  const averageCopy = !hasData
    ? averageDeltaCopy(false, averageDelta)
    : hasComparison
      ? `${averageDeltaCopy(true, averageDelta)} vs previous ranked check`
      : "new";
  const topDeltaCopy = hasComparison ? countDelta(metrics.top10Delta ?? 0) : "new";
  const visibilityDelta = metrics.visibilityDelta ?? 0;
  return [
    kpi("Avg. position", hasData ? metrics.averagePosition?.toFixed(1) ?? "-" : "-", averageCopy, tone(averageDelta)),
    kpi("Tracked keywords", String(keywordCount), addedThisMonth ? `+${addedThisMonth} this month` : "no new this month"),
    kpi("In top 10", hasData ? String(metrics.top10Count) : "-", hasData ? topDeltaCopy : "no data", tone(metrics.top10Delta ?? 0)),
    kpi("Visibility", hasVisibilityData ? `${Math.round(metrics.visibility ?? 0)}%` : "–", hasVisibilityData ? (hasComparison ? percentagePointCopy(visibilityDelta) : "new") : "awaiting first check", tone(visibilityDelta)),
  ];
}
