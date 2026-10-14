import { comparablePair, determinate } from "./qualify";
import type { MeasurementReport, MeasurementTarget, QualifiedMeasurement } from "./types";
import { frozenWeights } from "./weights";

export type AggregatePolicy = {
  metricId: string;
  definitionVersion: string;
  asOf: Date;
  curve: readonly number[];
  eligibleTotal?: number;
  baselineExpectedIds?: readonly string[];
  freshnessConfigured?: boolean;
  weightProvenance?: MeasurementReport["weightProvenance"];
};

function usable(check: QualifiedMeasurement | null) {
  return determinate(check) && check?.freshness !== "stale";
}
function usableTarget(target: MeasurementTarget) {
  return usable(target.current);
}

function coefficient(check: QualifiedMeasurement | null, curve: readonly number[]) {
  const position = check?.position;
  return check?.evidence === "positive" && position !== null && position !== undefined
    ? (curve[position - 1] ?? 0)
    : 0;
}

export function aggregateMeasurements(
  input: readonly MeasurementTarget[],
  policy: AggregatePolicy,
): MeasurementReport {
  if (
    !policy.curve.length ||
    policy.curve[0] <= 0 ||
    policy.curve.some((value) => !Number.isFinite(value) || value < 0 || value > policy.curve[0])
  )
    throw new Error("Invalid metric curve");
  const targets = [...input].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(targets.map(({ id }) => id)).size !== targets.length)
    throw new Error("Duplicate measurement target");
  for (const target of targets) {
    if (
      [target.current, target.baseline].some(
        (check) => check && check.measurement.targetId !== target.id,
      )
    ) {
      throw new Error("Measurement target does not match selected scope");
    }
  }
  const { weights, imputed } = frozenWeights(targets);
  const measured = targets.filter(usableTarget);
  const determinateTargets = targets.filter((target) => determinate(target.current));
  const paired = measured.filter((target) => comparablePair(target.current, target.baseline));
  // Normalize within the actual denominator cohort. Excluded or unpaired extreme
  // weights must not erase a finite positive denominator through underflow.
  const largestWeight = (rows: readonly MeasurementTarget[]) =>
    rows.reduce((largest, target) => Math.max(largest, weights.get(target.id) ?? 0), 0);
  const normalizedWeight = (id: string, largest: number) =>
    largest > 0 ? (weights.get(id) ?? 0) / largest : 0;
  const currentLargest = largestWeight(measured);
  const pairedLargest = largestWeight(paired);
  const totalWeight = (rows: readonly MeasurementTarget[], largest: number) =>
    rows.reduce((sum, target) => sum + normalizedWeight(target.id, largest), 0);
  const denominator = totalWeight(measured, currentLargest);
  const pairedDenominator = totalWeight(paired, pairedLargest);
  const contribution = (
    target: MeasurementTarget,
    key: "current" | "baseline",
    divisor: number,
    largest: number,
  ) =>
    divisor > 0
      ? ((100 * normalizedWeight(target.id, largest)) / divisor) *
        (coefficient(target[key], policy.curve) / policy.curve[0])
      : null;
  const contributions = measured.map((target) => ({
    targetId: target.id,
    weight: weights.get(target.id) ?? 0,
    value: contribution(target, "current", denominator, currentLargest),
    delta:
      paired.includes(target) && pairedDenominator > 0
        ? (contribution(target, "current", pairedDenominator, pairedLargest) ?? 0) -
          (contribution(target, "baseline", pairedDenominator, pairedLargest) ?? 0)
        : null,
  }));
  const expected = policy.eligibleTotal ?? targets.length;
  if (!Number.isSafeInteger(expected) || expected < targets.length)
    throw new Error("Invalid expected target count");
  const fresh = measured.filter(({ current }) => current?.freshness === "fresh").length;
  const unknownFreshness = targets.filter(({ current }) => current?.freshness === "unknown").length;
  const freshnessConfigured =
    policy.freshnessConfigured ??
    targets.some(({ current }) => current && current.freshnessReason !== "policy_unavailable");
  const freshnessReason = !freshnessConfigured
    ? ("policy_unavailable" as const)
    : (targets.find(({ current }) => current?.freshnessReason)?.current?.freshnessReason ?? null);
  const baselineIds = policy.baselineExpectedIds ? new Set(policy.baselineExpectedIds) : null;
  const currentIds = new Set(targets.map(({ id }) => id));
  return {
    metricId: policy.metricId,
    definitionVersion: policy.definitionVersion,
    asOf: policy.asOf.toISOString(),
    value: denominator > 0 ? contributions.reduce((sum, row) => sum + (row.value ?? 0), 0) : null,
    delta:
      pairedDenominator > 0 ? contributions.reduce((sum, row) => sum + (row.delta ?? 0), 0) : null,
    counts: {
      expected,
      measured: determinateTargets.length,
      metricEligible: measured.length,
      ranked: determinateTargets.filter(({ current }) => current?.evidence === "positive").length,
      knownAbsent: determinateTargets.filter(({ current }) => current?.evidence === "known_absent")
        .length,
      unknown: targets.filter(
        ({ current, latestAttempt }) =>
          current?.evidence === "unknown" || (!current && latestAttempt),
      ).length,
      neverChecked: targets.filter(({ current, latestAttempt }) => !current && !latestAttempt)
        .length,
      failed: targets.filter(({ latestAttempt }) => latestAttempt?.execution === "failed").length,
      stale: targets.filter(({ current }) => current?.freshness === "stale").length,
      unsupported: targets.filter(({ current }) => current?.evidence === "unsupported").length,
      freshDeterminate: freshnessConfigured && unknownFreshness === 0 ? fresh : null,
      unknownFreshness,
      comparable: paired.length,
    },
    dataCoverage:
      expected > 0 && freshnessConfigured && unknownFreshness === 0 ? fresh / expected : null,
    observedCoverage: expected > 0 ? determinateTargets.length / expected : null,
    freshness:
      !freshnessConfigured || unknownFreshness
        ? "unknown"
        : targets.some(({ current }) => current?.freshness === "stale")
          ? "stale"
          : "fresh",
    freshnessReason,
    imputedWeightShare:
      denominator > 0
        ? measured.reduce(
            (sum, target) =>
              sum + (imputed.has(target.id) ? normalizedWeight(target.id, currentLargest) : 0),
            0,
          ) / denominator
        : null,
    contributions,
    exclusions: targets
      .filter((target) => !usableTarget(target))
      .map(({ id, current }) => ({
        targetId: id,
        reason: current?.freshness === "stale" ? "stale" : (current?.reason ?? "not_observed"),
      })),
    added: baselineIds
      ? targets.filter(({ id }) => !baselineIds.has(id)).map(({ id }) => id)
      : null,
    removed: baselineIds ? [...baselineIds].filter((id) => !currentIds.has(id)).sort() : null,
    compositionReason: baselineIds ? null : "baseline_membership_unavailable",
    weightProvenance: policy.weightProvenance ?? { source: null, period: null, market: null },
    includedCount: targets.length,
    eligibleTotal: expected,
    isTruncated: expected > targets.length,
  };
}
