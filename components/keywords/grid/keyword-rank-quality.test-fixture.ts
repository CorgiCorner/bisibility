import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { aggregateMarketGridRows, groupRow } from "@/lib/keywords/market-grid-model";
import type { RankTrackerQualityRow } from "@/lib/queries/rank-tracker-report-model";
import type { ReportSummary } from "@/lib/rank-reports/model";
import type { RankQualityPoint } from "./keyword-rank-quality-view";

/** Serialized contract fixtures, not another measurement resolver. */
export function rankPoint(overrides: Partial<RankQualityPoint> = {}): RankQualityPoint {
  return {
    comparisonDigest: "scope-v1",
    evidence: "positive",
    freshness: "unknown",
    freshnessReason: "policy_unavailable",
    id: "chk_observed",
    normalizationVersion: "qualified-v1",
    observedAt: "2026-10-10T10:00:00.000Z",
    position: 6,
    provider: "fixture",
    rankingUrl: "https://example.com/retained",
    reason: null,
    recordedAt: "2026-10-10T10:01:00.000Z",
    reportedPosition: 6,
    requestedDepth: 100,
    ...overrides,
  };
}

export function rankQualityRow(id = "kw_fixture"): RankTrackerQualityRow {
  const resolution = {
    keywordId: id,
    baseline: rankPoint({
      id: "chk_baseline",
      position: 9,
      reportedPosition: 9,
      observedAt: "2026-10-03T10:00:00.000Z",
    }),
    comparison: "comparable" as const,
    comparisonBoundary: null,
    current: rankPoint(),
    event: "moved" as const,
    comparisonWindow: { before: "2026-10-03T12:00:00.000Z", notBefore: "2026-10-03T09:00:00.000Z" },
    comparisonUnavailableReason: null,
    lastSuccess: rankPoint(),
    latestAttempt: {
      id: "chk_observed",
      measurementRecordedAt: "2026-10-10T10:01:00.000Z",
      observedAt: "2026-10-10T10:00:00.000Z",
      recordedAt: "2026-10-10T09:59:00.000Z",
      status: "completed",
    },
    movement: 3,
  };
  return {
    ...keywordRows[0],
    id,
    position: 6,
    positionBaseline: 9,
    previousPosition: 9,
    checkState: "ranked",
    hasRankData: true,
    dataAsOfAt: resolution.current.observedAt,
    lastCheckAt: resolution.latestAttempt.recordedAt,
    lastCheckStatus: "completed",
    rankingUrl: resolution.current.rankingUrl,
    sparkline: [9, 8, 6],
    rankQuality: {
      ...resolution,
      currentScopeReason: null,
      currentScopeState: "verified",
      lastKnownScopes: null,
      lastKnown: {
        ...resolution,
        baseline: null,
        comparison: "not_requested",
        comparisonWindow: null,
        movement: null,
        event: null,
      },
    },
  };
}

export function currentScopeUnavailableRow() {
  const row = rankQualityRow();
  return {
    ...row,
    position: 101,
    hasRankData: false,
    checkState: "unknown" as const,
    positionBaseline: null,
    rankQuality: {
      ...row.rankQuality,
      baseline: null,
      comparison: "unavailable" as const,
      movement: null,
      event: "unknown" as const,
      current: rankPoint({
        evidence: "unknown",
        reason: "current_scope_unavailable",
        position: null,
      }),
      currentScopeReason: "current_scope_unavailable" as const,
      currentScopeState: "unavailable" as const,
    },
  };
}

export function wholeScopeReport(): ReportSummary {
  return {
    comparison: "requested",
    selectionDigest: "whole-filtered-selection",
    movementCounts: {
      improved: 1,
      declined: 1,
      first: 0,
      entered: 0,
      exited: 0,
      re_entered: 0,
      moved: 2,
      steady: 0,
      unknown: 8,
    },
    retainedHistory: { checks: 120, completeness: "retained_only", targets: 10 },
    timeBasis: {
      asOf: "2026-10-11T12:00:00.000Z",
      baseline: { before: "2026-10-04T12:00:00.000Z", notBefore: null },
      currentNotBefore: null,
    },
    metric: {
      metricId: "organic_visibility_top20",
      definitionVersion: "v1",
      asOf: "2026-10-11T12:00:00.000Z",
      value: 0.21,
      delta: null,
      counts: {
        expected: 10,
        measured: 5,
        metricEligible: 5,
        ranked: 4,
        knownAbsent: 1,
        unknown: 5,
        neverChecked: 2,
        failed: 1,
        stale: 1,
        unsupported: 0,
        freshDeterminate: null,
        unknownFreshness: 5,
        comparable: 2,
      },
      dataCoverage: 0.5,
      observedCoverage: 0.5,
      freshness: "unknown",
      freshnessReason: "policy_unavailable",
      imputedWeightShare: null,
      contributions: [],
      exclusions: [],
      added: null,
      removed: null,
      compositionReason: "baseline_membership_unavailable",
      weightProvenance: { source: null, period: null, market: null },
      includedCount: 10,
      eligibleTotal: 10,
      isTruncated: false,
    },
  };
}

export function rankQualityGroup() {
  const first = rankQualityRow("kw_one");
  const second = currentScopeUnavailableRow();
  const children = [
    first,
    {
      ...second,
      id: "kw_two",
      keyword: first.keyword,
      location: {
        ...second.location,
        canonicalKey: "country:es@es",
        countryCode: "ES",
        displayName: "Spain",
        gl: "es",
        hl: "es",
        id: "country:es@es",
        languageLabel: "Spanish",
      },
    },
  ];
  const aggregate = aggregateMarketGridRows(children)[0];
  const report = wholeScopeReport();
  report.metric.counts = {
    expected: 2,
    ranked: 1,
    knownAbsent: 0,
    unknown: 1,
    failed: 0,
    measured: 1,
    metricEligible: 1,
    neverChecked: 0,
    stale: 0,
    unsupported: 0,
    freshDeterminate: null,
    unknownFreshness: 2,
    comparable: 1,
  };
  report.metric.includedCount = 2;
  report.metric.eligibleTotal = 2;
  report.retainedHistory.targets = 2;
  return {
    ...groupRow({ ...aggregate, change: null, position: 6, sparkline: [], stale: false }, children),
    rankGroupReport: report,
    rankQuality: null,
  };
}
