import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import { reportDigest } from "./digest";
import type {
  RankReportPolicy,
  RankReportTarget,
  ReportSummary,
  ResolvedReportTarget,
} from "./model";
import { targetReportBaseline, targetReportFreshForMs } from "./policy";

export function resolveRankReportTargets(
  targets: readonly RankReportTarget[],
  policy: RankReportPolicy,
  kernelProjectId: string,
): ResolvedReportTarget[] {
  return targets.map((target) => ({
    checks: target.checks,
    ...(target.baselineWindow !== undefined ? { baselineWindow: target.baselineWindow } : {}),
    freshForMs: targetReportFreshForMs(target, policy),
    comparisonRequested: policy.baseline.mode === "before",
    id: target.id,
    resolution: resolveMeasurements(
      target.checks.map((check) => recordedMeasurement(check, target.id, kernelProjectId)),
      {
        asOf: policy.asOf,
        ...targetReportBaseline(target, policy),
        currentNotBefore: policy.currentNotBefore ?? undefined,
        expectedScope: target.expectedScope,
        freshForMs: targetReportFreshForMs(target, policy),
        horizon: policy.horizon,
        minimumRequestedDepth: policy.minimumRequestedDepth ?? undefined,
        requestedGeo: target.requestedGeo,
      },
    ),
    volume: target.volume,
  }));
}

/** All supplied targets participate before any display page is selected. */
export function summarizeRankReport(
  targets: readonly ResolvedReportTarget[],
  policy: RankReportPolicy,
): ReportSummary {
  const comparison = policy.baseline.mode === "before";
  const movementCounts: NonNullable<ReportSummary["movementCounts"]> = {
    improved: 0,
    declined: 0,
    entered: 0,
    exited: 0,
    first: 0,
    moved: 0,
    re_entered: 0,
    steady: 0,
    unknown: 0,
  };
  for (const { resolution } of targets) {
    movementCounts[resolution.event]++;
    if (resolution.event === "moved" && resolution.movement !== null) {
      if (resolution.movement > 0) movementCounts.improved++;
      if (resolution.movement < 0) movementCounts.declined++;
    }
  }
  const metric = aggregateMeasurements(
    targets.map((target) => ({
      baseline: comparison ? target.resolution.baseline : null,
      current: target.resolution.current,
      id: target.id,
      latestAttempt: target.resolution.latestAttempt,
      volume: target.volume,
    })),
    {
      asOf: policy.asOf,
      baselineExpectedIds: comparison ? policy.baselineExpectedIds : undefined,
      curve: policy.metric.curve,
      definitionVersion: policy.metric.definitionVersion,
      eligibleTotal: targets.length,
      freshnessConfigured: targets.length
        ? targets.some((target) => targetReportFreshForMs(target, policy) !== null)
        : policy.freshForMs !== null,
      metricId: policy.metric.id,
      weightProvenance: policy.weightProvenance,
    },
  );
  return {
    comparison: comparison ? "requested" : "not_requested",
    metric,
    movementCounts: comparison ? movementCounts : null,
    retainedHistory: {
      checks: targets.reduce((count, target) => count + target.checks.length, 0),
      completeness: "retained_only",
      targets: targets.length,
    },
    selectionDigest: reportDigest(targets.map(({ id }) => id).sort()),
    timeBasis: {
      asOf: policy.asOf.toISOString(),
      baseline:
        policy.baseline.mode === "before"
          ? {
              before: policy.baseline.before.toISOString(),
              notBefore: policy.baseline.notBefore?.toISOString() ?? null,
            }
          : null,
      currentNotBefore: policy.currentNotBefore?.toISOString() ?? null,
    },
  };
}
