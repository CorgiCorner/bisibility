import { comparableScopeKey, scopeKey } from "./scope";
import type {
  MeasurementEvidence,
  MeasurementPolicy,
  MeasurementReason,
  QualifiedMeasurement,
} from "./types";

export function positivePosition(value: number | null | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function freshness(measurement: MeasurementEvidence, policy: MeasurementPolicy) {
  if (policy.freshForMs == null)
    return { state: "unknown" as const, reason: "policy_unavailable" as const };
  if (!Number.isFinite(policy.freshForMs) || policy.freshForMs < 0)
    return { state: "unknown" as const, reason: "invalid_policy" as const };
  if (!measurement.observedAt)
    return { state: "unknown" as const, reason: "missing_observation_time" as const };
  const age = policy.asOf.getTime() - measurement.observedAt.getTime();
  return {
    state: age >= 0 && age <= policy.freshForMs ? ("fresh" as const) : ("stale" as const),
    reason: null,
  };
}

export function qualifyMeasurement(
  measurement: MeasurementEvidence,
  policy: MeasurementPolicy,
): QualifiedMeasurement {
  const position = positivePosition(measurement.position);
  const scope = measurement.effectiveScope;
  const key = scopeKey(scope);
  const expected = policy.expectedScope ?? measurement.configuredScope;
  const differentGeo =
    scope &&
    policy.requestedGeo &&
    Object.entries(policy.requestedGeo).some(
      ([name, value]) =>
        value !== undefined && scope[name as "location" | "language" | "device"] !== value,
    );
  let reason: MeasurementReason | null = null;
  if (measurement.supported === false) reason = "unsupported";
  else if (measurement.execution !== "completed") reason = "not_completed";
  else if (policy.requireCurrentScope && !policy.expectedScope?.targetRevision)
    reason = "current_scope_unavailable";
  else if (!key) reason = "missing_scope";
  else if ((expected && key !== scopeKey(expected)) || differentGeo) reason = "scope_mismatch";
  else if (!measurement.normalizationVersion) reason = "missing_normalization";
  else if (measurement.position !== null && position === null) reason = "invalid_position";
  else if (
    policy.minimumRequestedDepth !== undefined &&
    (measurement.requestedDepth === null ||
      measurement.requestedDepth < policy.minimumRequestedDepth)
  )
    reason = "insufficient_depth";
  else if (measurement.observedAt && measurement.observedAt > policy.asOf)
    reason = "future_observation";
  else if (
    position === null &&
    (measurement.completeThrough === null || measurement.completeThrough < policy.horizon)
  )
    reason = "unproven_absence";
  const comparable = comparableScopeKey(scope);
  const age = freshness(measurement, policy);
  return {
    comparisonKey:
      reason || !comparable || !measurement.provider || !measurement.observedAt
        ? null
        : JSON.stringify([comparable, measurement.provider, measurement.normalizationVersion]),
    evidence:
      reason === "unsupported"
        ? "unsupported"
        : reason
          ? "unknown"
          : position === null
            ? "known_absent"
            : "positive",
    freshness: age.state,
    freshnessReason: age.reason,
    measurement,
    position,
    reason,
  };
}

export function determinate(value: QualifiedMeasurement | null | undefined) {
  return value?.evidence === "positive" || value?.evidence === "known_absent";
}

export function comparablePair(
  current: QualifiedMeasurement | null,
  baseline: QualifiedMeasurement | null,
) {
  return (
    determinate(current) &&
    determinate(baseline) &&
    current?.freshness !== "stale" &&
    baseline?.freshness !== "stale" &&
    current?.comparisonKey != null &&
    current.comparisonKey === baseline?.comparisonKey
  );
}
