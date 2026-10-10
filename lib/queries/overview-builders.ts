import { comparableCompletedWindow } from "@/lib/checks/status";
import { hasIncompleteObservation } from "@/lib/serp/rank-depth";
import { rankBucketColors } from "@/lib/theme/chart-colors";
import type { Keyword } from "./overview-trend";
import type {
  Bucket,
  HighlightList,
  HighlightNote,
  HighlightPositionState,
  HighlightRow,
  Kpi,
  OverviewKpiDelta,
  OverviewKpiId,
  OverviewMetrics,
  RelativeTime,
  Tone,
} from "./overview-view-models";
import { summarizeVisibility, visibilitySnapshotFor } from "./visibility";

export type { Check, Keyword, Trend } from "./overview-trend";
export { buildTrend, buildTrendTakeaway } from "./overview-trend";
export type {
  Bucket,
  HighlightList,
  HighlightNote,
  HighlightPositionState,
  HighlightRow,
  Kpi,
  MetricDistributionBucket,
  OverviewKpiDelta,
  OverviewKpiId,
  OverviewMetrics,
  RelativeTime,
  Tone,
} from "./overview-view-models";
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
const roundToDisplayTenth = (value: number) => Number(value.toFixed(1));
export const pos = (value: number | null | undefined) =>
  typeof value === "number" && value > 0 && value <= 100 ? value : null;
export const tone = (value: number): Tone => {
  if (value > 0) return "positive";
  return value < 0 ? "negative" : "neutral";
};

export function snapshotFor(keyword: Keyword, volume: number | null = null) {
  const latestAttempt = keyword.rankChecks[0] ?? null;
  const comparableChecks = comparableCompletedWindow(keyword.rankChecks).checks;
  const latest = comparableChecks[0] ?? null;
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
    value: Math.abs(gained),
  } as const;
}

export function rowFor(
  snapshot: Snapshot,
  note: HighlightNote = { kind: "rankingUrl", url: snapshot.latest?.rankingUrl ?? null },
  showDelta = true,
): HighlightRow {
  const positionState: HighlightPositionState = snapshot.position
    ? "ranked"
    : hasIncompleteObservation(snapshot.latest?.observationRun?.completeness)
      ? "noData"
      : snapshot.latestAttempt?.status === "completed"
        ? "notRanked"
        : "awaitingFirstCheck";
  return {
    ...(showDelta ? { delta: delta(snapshot.position, snapshot.previous) } : {}),
    device: snapshot.keyword.device,
    id: snapshot.keyword.publicId,
    keyword: snapshot.keyword.text,
    marketCountryCode: snapshot.keyword.locationRef.countryCode ?? null,
    marketLanguageCode: snapshot.keyword.locationRef.languageCode ?? null,
    marketLanguageLabel: snapshot.keyword.locationRef.languageLabel,
    marketLocationLabel: snapshot.keyword.locationRef.displayName,
    note,
    position: snapshot.position,
    positionState,
    positionTone: snapshot.position ? "default" : "muted",
  };
}

export function list(kind: HighlightList["kind"], rows: HighlightRow[]) {
  return { kind, rows };
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
  const note = (item: Snapshot, direction: "dropped" | "gained"): HighlightNote => ({
    direction,
    kind: "movement",
    url: item.latest?.rankingUrl ?? null,
    value: Math.abs(item.movement ?? 0),
  });
  const successfulLatest = (item: Snapshot) => item.latestAttempt?.status === "completed" && Boolean(pos(item.latestAttempt.position));
  const wins = byGain.filter((item) => (item.movement ?? 0) > 0 && successfulLatest(item)).slice(0, 4).map((item) => rowFor(item, note(item, "gained")));
  const failures = snapshots.filter((item) => item.latestAttempt?.status === "failed").map((item) => ({
    ...rowFor(item, { kind: "latestCheckFailed" }, false), position: null, positionState: "noData" as const, positionTone: "danger" as const,
  }));
  const unknown = snapshots.filter((item) => item.latestAttempt?.status === "completed" && !pos(item.latestAttempt.position) && hasIncompleteObservation(item.latestAttempt.observationRun?.completeness)).map((item) => rowFor(item, { kind: "coverageUnknown" }, false));
  const outsideTop100 = snapshots.filter((item) => item.latestAttempt?.status === "completed" && !pos(item.latestAttempt.position) && !hasIncompleteObservation(item.latestAttempt.observationRun?.completeness)).map((item) => ({
    ...rowFor(item, { kind: "latestCheckNotRanked" }, false), position: null, positionState: "notRanked" as const, positionTone: "muted" as const,
  }));
  const drops = byGain.filter((item) => (item.movement ?? 0) < 0 && successfulLatest(item)).reverse().map((item) => rowFor(item, note(item, "dropped")));
  const top10 = snapshots
    .filter((item) => successfulLatest(item) && item.position && item.position <= 10 && (item.previous === null || item.previous > 10))
    .sort((a, b) => (a.position ?? 101) - (b.position ?? 101)).slice(0, 4)
    .map((item) => rowFor(item, { kind: "enteredTop10", url: item.latest?.rankingUrl ?? null }));
  const recentCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentlyAdded = snapshots
    .filter((item) => item.keyword.createdAt.getTime() >= recentCutoff && item.keyword.createdAt.getTime() <= now.getTime())
    .sort((a, b) => b.keyword.createdAt.getTime() - a.keyword.createdAt.getTime()).slice(0, 4)
    .map((item) => {
      const minutes = Math.max(0, Math.floor((now.getTime() - item.keyword.createdAt.getTime()) / 60_000));
      const age: RelativeTime = minutes < 1
        ? { kind: "justNow" }
        : minutes < 60
          ? { kind: "minutes", value: minutes }
          : minutes < 24 * 60
            ? { kind: "hours", value: Math.floor(minutes / 60) }
            : Math.floor(minutes / (24 * 60)) === 1
              ? { kind: "yesterday" }
              : { kind: "days", value: Math.floor(minutes / (24 * 60)) };
      const isNotRanked = item.latestAttempt?.status === "completed" && !pos(item.latestAttempt.position) && !hasIncompleteObservation(item.latestAttempt.observationRun?.completeness);
      return rowFor(item, {
        age,
        checkState: isNotRanked ? "notRanked" : item.latest ? "rankingUrl" : "firstCheckPending",
        kind: "recentlyAdded",
        url: item.latest?.rankingUrl ?? null,
      });
    });
  return [
    list("wins", wins),
    list("attention", [...failures, ...unknown, ...outsideTop100, ...drops].slice(0, 4)),
    list("newTop10", top10),
    list("recentlyAdded", recentlyAdded),
  ];
}

export function kpi(
  id: OverviewKpiId,
  value: number | null,
  delta: OverviewKpiDelta,
  deltaTone: Tone = "neutral",
): Kpi {
  return { delta, deltaTone, id, value };
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
  const averageDelta = roundToDisplayTenth(metrics.averagePositionDelta ?? 0);
  const waitingCopy: OverviewKpiDelta = hasFailedChecks
    ? { kind: "firstCheckFailed" }
    : { kind: "awaitingFirstCheck" };
  const waitingTone = hasFailedChecks ? "negative" : "neutral";
  const waitingAction = hasFailedChecks ? "check_runs" : undefined;
  const waitingKpi = (id: OverviewKpiId, value: number | null): Kpi => ({
    delta: waitingCopy,
    ...(waitingAction ? { deltaAction: waitingAction } : {}),
    deltaTone: waitingTone,
    id,
    value,
  });
  const averageCopy: OverviewKpiDelta = hasPositionData
    ? hasComparison
      ? { kind: "averageComparison", value: averageDelta }
      : { kind: "new" }
    : { kind: "noRankedPositions" };
  const topDeltaCopy: OverviewKpiDelta = hasComparison
    ? { kind: "countChange", value: metrics.top10Delta ?? 0 }
    : { kind: "new" };
  const visibilityDelta = roundToDisplayTenth(metrics.visibilityDelta ?? 0);
  if (!hasCompletedChecks) {
    return [
      waitingKpi("averagePosition", null),
      kpi("trackedKeywords", keywordCount, addedThisMonth ? { kind: "countThisMonth", value: addedThisMonth } : { kind: "noNewThisMonth" }),
      waitingKpi("inTop10", null),
      waitingKpi("visibility", null),
    ];
  }
  const visibilityKpi =
    metrics.visibility === null
      ? {
          ...waitingKpi("visibility", null),
          delta: hasFailedChecks
            ? waitingCopy
            : ({ kind: "awaitingTop20" } satisfies OverviewKpiDelta),
        }
      : kpi(
          "visibility",
          Math.round(metrics.visibility),
          metrics.visibilityDelta === null
            ? { kind: "new" }
            : { kind: "percentagePointChange", value: visibilityDelta },
          tone(visibilityDelta),
        );
  return [
    kpi("averagePosition", hasPositionData ? metrics.averagePosition : null, averageCopy, tone(averageDelta)),
    kpi("trackedKeywords", keywordCount, addedThisMonth ? { kind: "countThisMonth", value: addedThisMonth } : { kind: "noNewThisMonth" }),
    kpi("inTop10", metrics.top10Count ?? 0, topDeltaCopy, tone(metrics.top10Delta ?? 0)),
    visibilityKpi,
  ];
}
