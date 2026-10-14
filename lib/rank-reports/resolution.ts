import { comparablePair } from "@/lib/rank-measurements/qualify";
import type { QualifiedMeasurement } from "@/lib/rank-measurements/types";
import { reportDigest } from "./digest";
import type { RankReportPolicy, ResolvedReportTarget } from "./model";

function reference(point: QualifiedMeasurement | null, target: ResolvedReportTarget) {
  if (!point) return null;
  const check = target.checks.find(({ id }) => id === point.measurement.id);
  return {
    comparisonDigest: point.comparisonKey ? reportDigest(point.comparisonKey) : null,
    evidence: point.evidence,
    freshness: point.freshness,
    freshnessReason: point.freshnessReason,
    id: point.measurement.id,
    normalizationVersion: point.measurement.normalizationVersion,
    observedAt: point.measurement.observedAt?.toISOString() ?? null,
    position: point.evidence === "positive" ? point.position : null,
    provider: point.measurement.provider,
    rankingUrl: check?.rankingUrl ?? null,
    reason: point.reason,
    recordedAt: point.measurement.recordedAt.toISOString(),
    reportedPosition: point.measurement.position,
    requestedDepth: point.measurement.requestedDepth,
  };
}

/** Projection of the kernel result, with no independent movement/baseline calculation. */
export function rankReportTargetResolution(target: ResolvedReportTarget, policy: RankReportPolicy) {
  const { resolution } = target;
  const requested = policy.baseline.mode === "before";
  const window =
    !requested || target.baselineWindow === null
      ? null
      : (target.baselineWindow ?? (policy.baseline.mode === "before" ? policy.baseline : null));
  const attemptCheck = target.checks.find(({ id }) => id === resolution.latestAttempt?.id);
  return {
    baseline: requested ? reference(resolution.baseline, target) : null,
    comparison: !requested
      ? ("not_requested" as const)
      : comparablePair(resolution.current, resolution.baseline)
        ? ("comparable" as const)
        : ("unavailable" as const),
    comparisonBoundary:
      requested && resolution.boundary
        ? {
            point: reference(resolution.boundary, target),
            reason: "incompatible_or_unproven" as const,
          }
        : null,
    comparisonWindow: window
      ? { before: window.before.toISOString(), notBefore: window.notBefore?.toISOString() ?? null }
      : null,
    comparisonUnavailableReason:
      requested && target.baselineWindow === null
        ? ("baseline_tolerance_unavailable" as const)
        : null,
    current: reference(resolution.current, target),
    event: requested ? resolution.event : null,
    keywordId: target.id,
    lastSuccess: reference(resolution.lastSuccess, target),
    latestAttempt: resolution.latestAttempt
      ? {
          id: resolution.latestAttempt.id,
          measurementRecordedAt: resolution.latestAttempt.recordedAt.toISOString(),
          observedAt: resolution.latestAttempt.observedAt?.toISOString() ?? null,
          recordedAt: attemptCheck?.createdAt.toISOString() ?? null,
          status: resolution.latestAttempt.execution,
        }
      : null,
    movement: requested ? resolution.movement : null,
  };
}
