import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { keywordRows } from "./keywords-fixtures";

/** Serialized synthetic presentation contracts; these fixtures claim no live revision/cadence proof. */
export function detailQualityFixture(): KeywordDetailQuality {
  const current = {
    comparisonDigest: "captured-definition-v1",
    evidence: "positive" as const,
    freshness: "unknown" as const,
    freshnessReason: "policy_unavailable" as const,
    id: "check_aaaaaaaaaaaaaaaaaaaaaaaa",
    normalizationVersion: "v1",
    observedAt: "2026-10-12T10:00:00.000Z",
    position: 6,
    provider: "serpapi",
    rankingUrl: "https://example.com/retained",
    reason: null,
    recordedAt: "2026-10-12T10:01:00.000Z",
    reportedPosition: 6,
    requestedDepth: 100,
  };
  const q = {
    baseline: {
      ...current,
      id: "check_bbbbbbbbbbbbbbbbbbbbbbbb",
      observedAt: "2026-10-05T10:00:00.000Z",
      position: 9,
      reportedPosition: 9,
    },
    comparison: "comparable" as const,
    comparisonBoundary: null,
    comparisonUnavailableReason: null,
    comparisonWindow: { before: "2026-10-05T12:00:00.000Z", notBefore: "2026-10-05T09:00:00.000Z" },
    current,
    event: "moved" as const,
    keywordId: keywordRows[0].id,
    lastSuccess: current,
    latestAttempt: {
      id: current.id,
      measurementRecordedAt: current.recordedAt,
      observedAt: current.observedAt,
      recordedAt: "2026-10-12T09:59:00.000Z",
      status: "completed",
    },
    movement: 3,
  };
  return {
    asOf: "2026-10-12T12:00:00.000Z",
    definitionVersion: "fixture-v1",
    keywordId: q.keywordId,
    expectedScope: {
      device: "desktop",
      engine: "google",
      language: "en",
      location: "United States",
      identityRevision: null,
      policyRevision: "policy-v1",
      rankScale: "organic_group",
      resultKind: "organic_result",
      surface: "web_serp",
      targetRevision: "target-v1",
    },
    latestAttemptProvider: "serpapi",
    retainedChecks: 320,
    sourceDigest: "fixture-header-history-snapshot",
    best: {
      comparisonDigest: current.comparisonDigest,
      definitionOrigin: "current_definition",
      id: "check_cccccccccccccccccccccccc",
      observedAt: "2026-01-01T10:00:00.000Z",
      position: 3,
      provider: current.provider,
      qualifyingCount: 320,
      recordedAt: "2026-01-01T10:01:00.000Z",
    },
    rankQuality: {
      ...q,
      currentScopeReason: null,
      currentScopeState: "verified",
      lastKnown: { ...q, baseline: null, comparison: "not_requested", event: null, movement: null },
      lastKnownScopes: null,
    },
  };
}

export function unavailableDetailQuality(): KeywordDetailQuality {
  const original = detailQualityFixture();
  if (!original.rankQuality.current || !original.best)
    throw new Error("Missing synthetic fixture point");
  return {
    ...original,
    expectedScope: null,
    best: { ...original.best, definitionOrigin: "last_known_definition" },
    rankQuality: {
      ...original.rankQuality,
      currentScopeReason: "current_scope_unavailable",
      currentScopeState: "unavailable",
      current: {
        ...original.rankQuality.current,
        comparisonDigest: null,
        evidence: "unknown",
        position: null,
        reason: "current_scope_unavailable",
      },
      baseline: null,
      comparison: "unavailable",
      event: "unknown",
      movement: null,
    },
  };
}

export function detailMetadataFixture() {
  return {
    ...keywordRows[0],
    position: 99,
    bestPosition: 99,
    lastCheckAt: "2000-01-01T00:00:00.000Z",
    rankingUrl: "https://example.com/obsolete",
    completedComparableChecks: [
      {
        checkedAt: "2000-01-01T00:00:00.000Z",
        position: 99,
        rankingUrl: "https://example.com/obsolete",
      },
    ],
  };
}
