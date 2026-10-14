import { comparablePair, determinate } from "@/lib/rank-measurements/qualify";
import type { Snapshot } from "./overview-snapshot";
import { summarizeVisibility, visibilitySnapshotFor } from "./visibility";

const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const buckets = [
  [1, 3],
  [4, 10],
  [11, 20],
  [21, 50],
  [51, 100],
] as const;

export function buildOverviewMetrics(
  snapshots: Snapshot[],
  options: { asOf?: Date; eligibleTotal?: number } = {},
) {
  const positions = overviewRankedPositions(snapshots);
  const comparable = snapshots.filter(
    (item) => item.quality.movement !== null && item.position && item.previous,
  );
  const currentComparable = comparable.map((item) => item.position as number);
  const previous = comparable.map((item) => item.previous as number);
  const hasCompletedChecks = snapshots.some(
    (item) => determinate(item.quality.current) && item.quality.current?.freshness !== "stale",
  );
  const countAt = (limit: number, values = positions) =>
    values.filter((value) => value <= limit).length;
  const averagePositionDelta = comparable.length
    ? average(previous) - average(currentComparable)
    : null;
  const visibility = summarizeVisibility(
    snapshots.map((snapshot) =>
      visibilitySnapshotFor(snapshot.keyword, snapshot.volume, { asOf: options.asOf }),
    ),
    options,
  );
  const topPairs = snapshots.filter((item) =>
    comparablePair(item.quality.current, item.quality.baseline),
  );
  const top10Delta = topPairs.length
    ? topPairs.filter(
        (item) =>
          item.quality.current?.evidence === "positive" &&
          (item.quality.current.position ?? 101) <= 10,
      ).length -
      topPairs.filter(
        (item) =>
          item.quality.baseline?.evidence === "positive" &&
          (item.quality.baseline.position ?? 101) <= 10,
      ).length
    : null;

  return {
    averagePosition: positions.length ? average(positions) : null,
    averagePositionDelta,
    positionDistribution: buckets.map(([min, max]) => ({
      count: hasCompletedChecks
        ? positions.filter((position) => position >= min && position <= max).length
        : null,
      max,
      min,
    })),
    top3Count: hasCompletedChecks ? countAt(3) : null,
    top10Count: hasCompletedChecks ? countAt(10) : null,
    top10Delta,
    top100Count: hasCompletedChecks ? positions.length : null,
    visibility: visibility.value,
    visibilityDelta: visibility.delta,
    visibilityMeasuredKeywordCount: visibility.measuredKeywordCount,
    qualityReport: visibility.report,
  };
}

/** Execution failure and retained observation quality are independent. This is shared with the chart. */
export function overviewRankedPositions(snapshots: readonly Snapshot[]) {
  return snapshots.flatMap(({ quality, position }) =>
    quality.current?.evidence === "positive" &&
    quality.current.freshness !== "stale" &&
    position !== null
      ? [position]
      : [],
  );
}
