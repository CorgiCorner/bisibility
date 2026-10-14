import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { RankTrackerQualityRow } from "@/lib/queries/rank-tracker-report-model";
import type { FreshnessState } from "@/lib/rank-measurements/types";
import type { ReportSummary } from "@/lib/rank-reports/model";
import { hasTrackedPosition } from "@/lib/serp/rank-depth";

type Quality = RankTrackerQualityRow["rankQuality"];
export type RankQualityPoint = NonNullable<Quality["current"]>;
type Sidecars = { rankGroupReport?: ReportSummary; rankQuality?: Quality | null };

export function keywordRankQuality(row: KeywordRow): Quality | null {
  if (marketGridParent(row)) return null;
  return (row as KeywordRow & Sidecars).rankQuality ?? null;
}

export function keywordGroupReport(row: KeywordRow): ReportSummary | null {
  return marketGridParent(row) ? ((row as KeywordRow & Sidecars).rankGroupReport ?? null) : null;
}

export function positivePoint(
  point: Quality["current"],
): (RankQualityPoint & { position: number }) | null {
  return point?.evidence === "positive" &&
    point.position !== null &&
    Number.isInteger(point.position) &&
    point.position > 0
    ? { ...point, position: point.position }
    : null;
}

/** Presentation consumes qualified values, never computes another rank or baseline. */
export function keywordRankView(row: KeywordRow) {
  const parent = marketGridParent(row);
  const group = keywordGroupReport(row);
  const quality = keywordRankQuality(row);
  const current = positivePoint(quality?.current ?? null);
  const historical =
    positivePoint(quality?.lastKnown.current ?? null) ??
    positivePoint(quality?.lastKnown.lastSuccess ?? null);
  const legacyGroupPosition =
    parent &&
    !group &&
    parent.aggregate.children.some(
      (child) => hasTrackedPosition(child) && child.position === parent.aggregate.position,
    )
      ? parent.aggregate.position
      : null;
  const legacyPosition = parent
    ? legacyGroupPosition
    : !quality && hasTrackedPosition(row)
      ? row.position
      : null;
  const groupPosition =
    group && group.metric.counts.ranked > 0 && parent?.aggregate.position !== null
      ? (parent?.aggregate.position ?? null)
      : null;
  const currentPosition = parent ? groupPosition : (current?.position ?? null);
  const evidence = parent
    ? group &&
      group.metric.counts.expected > 0 &&
      group.metric.counts.knownAbsent === group.metric.counts.expected
      ? "known_absent"
      : currentPosition !== null
        ? "positive"
        : "unknown"
    : (quality?.current?.evidence ??
      (row.checkState === "never_checked" ? "not_observed" : "unknown"));
  const freshness: FreshnessState =
    (parent ? group?.metric.freshness : quality?.current?.freshness) ?? "unknown";
  return {
    currentPosition,
    evidence,
    group,
    isGroup: Boolean(parent),
    freshness,
    lastKnown: historical
      ? {
          position: historical.position,
          observedAt: historical.observedAt,
          recordedAt: historical.recordedAt,
          storedAt: null,
          rankingUrl: historical.rankingUrl,
        }
      : legacyPosition === null
        ? null
        : {
            position: legacyPosition,
            observedAt: null,
            recordedAt: null,
            storedAt: parent ? null : (row.dataAsOfAt ?? row.lastCheckAt),
            rankingUrl: row.rankingUrl,
          },
    quality,
    reason: quality?.currentScopeReason ?? quality?.current?.reason ?? null,
  };
}

export function keywordRankMovement(row: KeywordRow): number | null {
  const parent = marketGridParent(row);
  if (parent)
    return parent.aggregate.children.length === 1
      ? keywordRankMovement(parent.aggregate.children[0] as KeywordRow)
      : null;
  const quality = keywordRankQuality(row);
  return quality?.comparison === "comparable" &&
    positivePoint(quality.current) &&
    positivePoint(quality.baseline) &&
    quality.movement !== null &&
    Number.isFinite(quality.movement)
    ? quality.movement
    : null;
}

export function keywordRankEvent(row: KeywordRow) {
  if (marketGridParent(row)) return null;
  const quality = keywordRankQuality(row);
  return quality?.comparison === "not_requested" ? null : (quality?.event ?? null);
}

export function hasRetainedRankHistory(row: KeywordRow): boolean {
  return (
    keywordRankQuality(row) !== null &&
    row.sparkline.some((point) => Number.isFinite(point) && point > 0)
  );
}

/** An aggregate date comes from all children; the parent's copied first-child status is ignored. */
export function keywordRecordedAttempt(row: KeywordRow) {
  const parent = marketGridParent(row);
  if (!parent) return keywordRankQuality(row)?.latestAttempt ?? null;
  return (
    parent.aggregate.children
      .flatMap((child) => keywordRankQuality(child)?.latestAttempt ?? [])
      .filter((attempt) => attempt.recordedAt !== null)
      .sort(
        (a, b) =>
          (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
