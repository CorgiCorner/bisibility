import { aggregateLocalRows } from "@/lib/dashboard-local/aggregate";
import type { LocalReport, LocalRow } from "@/lib/dashboard-local/model";
import { aggregateMarketGridRows, groupRow } from "@/lib/keywords/market-grid-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { reportDigest } from "@/lib/rank-reports/digest";
import { RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import type { RankReportPolicy, ResolvedReportTarget } from "@/lib/rank-reports/model";
import { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import type { RankTrackerLocalFact } from "./rank-tracker-local-model";
import { rankTrackerReportFacets } from "./rank-tracker-report-facets";
import { rankTrackerQualityRowMatches } from "./rank-tracker-report-filter";
import type { RankTrackerQualityRow } from "./rank-tracker-report-model";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";

export function localProjection(row: LocalRow, policy: RankReportPolicy) {
  const reference = (resolution: LocalRow["target"]) => {
    const target: ResolvedReportTarget = {
      id: row.keywordId,
      checks: [],
      comparisonRequested: policy.baseline.mode === "before",
      baselineWindow: row.baselineWindow ?? null,
      resolution,
      volume: null,
    };
    return rankReportTargetResolution(target, policy);
  };
  const target = reference(row.target);
  if (target.latestAttempt && row.target.latestAttempt)
    target.latestAttempt.recordedAt = row.target.latestAttempt.recordedAt.toISOString();
  const fact: RankTrackerLocalFact = {
    keywordId: row.keywordId,
    presence: reference(row.presence).current,
    target: target.current,
    latestAttempt: target.latestAttempt,
  };
  return { target, fact };
}
export function filterRankTrackerLocalRows(
  metadata: readonly RankTrackerQualityRow[],
  report: LocalReport,
  query: RankTrackerQueryState,
  policy: RankReportPolicy,
) {
  const byId = new Map(report.rows.map((row) => [row.keywordId, row]));
  const unsupportedFilters =
    query.filters.wrongUrl || query.filters.urlChanged || query.filters.serp.length > 0;
  const rows = metadata.flatMap((row) => {
    const local = byId.get(row.id);
    if (!local) return [];
    const projection = localProjection(local, policy);
    // The shared resolver supplies the positive/absence/unknown state; no local rank formula exists here.
    const quality: RankTrackerQualityRow = {
      ...row,
      rankingUrl: null,
      rankingPath: null,
      rankingPages: 0,
      rankQuality: {
        ...projection.target,
        currentScopeState: "unavailable",
        currentScopeReason: "current_scope_unavailable",
        lastKnown: projection.target,
        lastKnownScopes: null,
      },
    };
    const search = query.search.trim().toLowerCase();
    const terms = [row.keyword, row.id, row.tags.join(" "), row.topic, row.intent]
      .join(" ")
      .toLowerCase();
    if (
      unsupportedFilters ||
      (search && !terms.includes(search)) ||
      !rankTrackerQualityRowMatches(quality, { ...query, search: "" })
    )
      return [];
    return [quality];
  });
  const sorted = sortRankTrackerQualityRows(rows, query.sort);
  const selectedIds = new Set(sorted.map((row) => row.id));
  const selected = report.rows.filter((row) => selectedIds.has(row.keywordId));
  if (selected.some((row) => row.retainedChecks === undefined))
    throw new RankReportSnapshotConflictError();
  const filtered = {
    ...report,
    selectionDigest: reportDigest({
      report: report.selectionDigest,
      selected: [...selectedIds].sort(),
      query,
    }),
    expected: selected.length,
    retainedChecks: selected.reduce((sum, row) => sum + (row.retainedChecks ?? 0), 0),
    ...aggregateLocalRows(selected, policy.asOf),
    rows: selected,
  };
  const neutral = sorted.map(({ rankQuality: _quality, ...row }) => ({
    ...row,
    hasRankData: false,
    bestPosition: null,
    position: 101,
    previousPosition: null,
    positionBaseline: null,
    positionHistory: [],
    completedComparableChecks: [],
    positionObservations: [],
    rankingUrlHistory: [],
    rankingUrl: null,
    rankingPath: null,
    rankingPages: 0,
    sparkline: [],
    serpFeatures: [],
    lastCheckAt: byId.get(row.id)?.target.current?.measurement.observedAt?.toISOString() ?? null,
  }));
  const groups = query.grouped
    ? aggregateMarketGridRows(neutral, policy.asOf).map((aggregate) =>
        groupRow(aggregate, aggregate.children),
      )
    : [];
  return {
    rows: neutral,
    groups,
    filtered,
    unsupportedFilters,
    facets: rankTrackerReportFacets(sorted),
    facts: selected.map((row) => localProjection(row, policy).fact),
  };
}
