import type {
  RankReportAttempt,
  RankReportItem,
  RankReportObservation,
} from "@/lib/rank-reports/records";
import type {
  HistoryPage,
  HistoryPages,
  KeywordHistoryPort,
  ObservationHistoryPage,
  RetainedHistorySnapshot,
} from "./history-contract";

export const historyWindow = {
  basis: "observed_at" as const,
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-12-31T12:00:00.000Z",
};
export const historyScope = {
  engine: "google",
  surface: "web",
  resultKind: "organic",
  rankScale: "organic",
  location: "country:us@en",
  language: "en",
  device: "desktop",
  targetRevision: "target-v1",
  policyRevision: "policy-v1",
  identityRevision: "identity-v1",
};
export function checkId(index: number) {
  return `chk_${String(index).padStart(24, "a")}`;
}

export function observation(
  index: number,
  overrides: Partial<RankReportObservation> = {},
): RankReportObservation {
  const at = new Date(Date.parse(historyWindow.from) + index * 6 * 60 * 60 * 1000).toISOString();
  return {
    id: checkId(index),
    keywordId: "kw_abcdefghijklmnopqrstuvwx",
    checkedAt: at,
    checkRecordedAt: at,
    observedAt: at,
    recordedAt: at,
    requestedAt: at,
    comparisonDigest: "scope-v1",
    completeThrough: 100,
    completeness: "complete",
    configuredScope: historyScope,
    effectiveScope: historyScope,
    evidence: "positive",
    expectedUrlAtCheck: "https://example.com/old-target",
    freshness: "unknown",
    freshnessAsOf: historyWindow.to,
    freshnessReason: "policy_unavailable",
    normalizationVersion: "qualified-v1",
    position: 6,
    provider: "fixture",
    rankingUrl: `https://example.com/saved-${index}`,
    reason: null,
    reportedPosition: 6,
    requestedDepth: 100,
    ...overrides,
  };
}

export function attempt(
  index: number,
  overrides: Partial<RankReportAttempt> = {},
): RankReportAttempt {
  const record = observation(index);
  return {
    checkedAt: record.checkedAt,
    checkRecordedAt: record.checkRecordedAt,
    observedAt: record.observedAt,
    recordedAt: record.checkRecordedAt,
    requestedAt: record.requestedAt,
    deferredReason: null,
    errorCode: null,
    finishedAt: record.recordedAt,
    id: record.id,
    keywordId: record.keywordId,
    kind: "logical_rank_check",
    provider: "fixture",
    reportedProviderAttemptCount: 1,
    startedAt: record.checkRecordedAt,
    status: "completed",
    ...overrides,
  };
}

function envelope() {
  return {
    asOf: historyWindow.to,
    definitionVersion: "v1",
    excludedUnknownTime: 0,
    nextCursor: null,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    sourceDigest: "frozen-source-v1",
    totalCount: 0,
    window: historyWindow,
    resolutions: [],
    summary: {
      comparison: "not_requested" as const,
      movementCounts: null,
      selectionDigest: "selected-target-v1",
      retainedHistory: { checks: 320, completeness: "retained_only" as const, targets: 1 },
      timeBasis: { asOf: historyWindow.to, baseline: null, currentNotBefore: null },
      metric: {
        metricId: "organic_visibility_top20",
        definitionVersion: "v1",
        asOf: historyWindow.to,
        value: 0.42,
        delta: null,
        counts: {
          expected: 1,
          measured: 1,
          metricEligible: 1,
          ranked: 1,
          knownAbsent: 0,
          unknown: 0,
          neverChecked: 0,
          failed: 0,
          stale: 0,
          unsupported: 0,
          freshDeterminate: null,
          unknownFreshness: 1,
          comparable: 0,
        },
        dataCoverage: 1,
        observedCoverage: 1,
        freshness: "unknown" as const,
        freshnessReason: "policy_unavailable" as const,
        imputedWeightShare: null,
        contributions: [],
        exclusions: [],
        added: null,
        removed: null,
        compositionReason: "baseline_membership_unavailable" as const,
        weightProvenance: { source: null, period: null, market: null },
        includedCount: 1,
        eligibleTotal: 1,
        isTruncated: false,
      },
    },
  };
}

export function observationPage(count = 3): ObservationHistoryPage {
  return {
    ...envelope(),
    records: Array.from({ length: count }, (_, index) => observation(index)).reverse(),
    stream: "observations",
    totalCount: count,
  };
}
export function historyPages(count = 3): HistoryPages {
  const observations = observationPage(count);
  const attempts = {
    ...envelope(),
    window: { ...historyWindow, basis: "recorded_at" as const },
    records: Array.from({ length: count }, (_, index) => attempt(index)).reverse(),
    stream: "attempts" as const,
    totalCount: count,
  };
  return { observations, attempts };
}

export function snapshot(
  record = observation(0),
  items: readonly RankReportItem[] = [],
): RetainedHistorySnapshot {
  return {
    asOf: historyWindow.to,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    observation: record,
    items,
    detailState: "expired",
  };
}

export function normalizedItem(record = observation(0)): RankReportItem {
  return {
    checkedAt: record.checkedAt,
    checkRecordedAt: record.checkRecordedAt,
    observedAt: record.observedAt,
    recordedAt: record.recordedAt,
    requestedAt: record.requestedAt,
    blockPosition: null,
    businessName: null,
    checkId: record.id,
    cid: null,
    domain: "example.com",
    id: `${record.id}:item:stored-item`,
    keywordId: record.keywordId,
    mapsUrl: null,
    ordinal: 0,
    placeId: null,
    positionInBlock: null,
    rankAbsolute: 6,
    rankGroup: 6,
    rankScale: null,
    promotion: null,
    sourcePage: null,
    sourceBlockId: null,
    sourceOrdinal: null,
    sourceObservedAt: null,
    resultKind: "organic",
    title: "Stored result",
    url: record.rankingUrl,
  };
}

/** Deterministic read adapter for UI tests; does not stand in for real server authorization tests. */
export function fixtureHistoryPort(all = historyPages()): KeywordHistoryPort {
  return {
    initial: all,
    windows: [{ id: "retained-window", window: historyWindow }],
    readWindow: async () => ({ ok: true, value: all }),
    readPage: async () => ({ ok: false, reason: "unavailable" }),
    readSnapshot: async ({ checkId: id }) => {
      const record = all.observations.records.find((record) => record.id === id);
      return record ? { ok: true, value: snapshot(record) } : { ok: false, reason: "forbidden" };
    },
  };
}

export function pagedHistory(count = 320, pageLimit = 250) {
  const all = historyPages(count);
  const first: HistoryPages = {
    observations: {
      ...all.observations,
      records: all.observations.records.slice(0, pageLimit),
      nextCursor: "observations-next",
    },
    attempts: {
      ...all.attempts,
      records: all.attempts.records.slice(0, pageLimit),
      nextCursor: "attempts-next",
    },
  };
  const rest: Record<HistoryPage["stream"], HistoryPage> = {
    observations: { ...all.observations, records: all.observations.records.slice(pageLimit) },
    attempts: { ...all.attempts, records: all.attempts.records.slice(pageLimit) },
  };
  return { all, first, rest };
}
