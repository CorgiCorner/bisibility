import type { RankReportPolicy, RankReportTarget } from "./model";

/** Shared TTL is usable only when the host has supplied no target-specific policy. */
export function targetReportFreshForMs(
  target: Pick<RankReportTarget, "freshForMs">,
  policy: RankReportPolicy,
) {
  return target.freshForMs === undefined ? policy.freshForMs : target.freshForMs;
}

/** A host cannot turn an unknown target tolerance into an unbounded historical comparison. */
export function targetReportBaseline(
  target: Pick<RankReportTarget, "baselineWindow">,
  policy: RankReportPolicy,
) {
  if (policy.baseline.mode === "none" || target.baselineWindow === null)
    return { baselineEnabled: false };
  const baseline = target.baselineWindow ?? policy.baseline;
  if (
    !Number.isFinite(baseline.before.getTime()) ||
    baseline.before > policy.asOf ||
    (baseline.notBefore &&
      (!Number.isFinite(baseline.notBefore.getTime()) || baseline.notBefore > baseline.before))
  ) {
    throw new Error("Target comparison window is invalid.");
  }
  return {
    baselineEnabled: true,
    baselineBefore: new Date(baseline.before.getTime()),
    ...(baseline.notBefore ? { baselineNotBefore: new Date(baseline.notBefore.getTime()) } : {}),
  };
}

/** Registry objects/dates may be shared by requests; freeze the declared semantics for this read. */
export function snapshotRankReportPolicy(source: RankReportPolicy): RankReportPolicy {
  return {
    asOf: new Date(source.asOf.getTime()),
    baseline:
      source.baseline.mode === "none"
        ? { mode: "none" }
        : {
            before: new Date(source.baseline.before.getTime()),
            mode: "before",
            notBefore: source.baseline.notBefore
              ? new Date(source.baseline.notBefore.getTime())
              : null,
          },
    ...(source.baselineExpectedIds ? { baselineExpectedIds: [...source.baselineExpectedIds] } : {}),
    ...(source.baselineProjectId !== undefined
      ? { baselineProjectId: source.baselineProjectId }
      : {}),
    currentNotBefore: source.currentNotBefore ? new Date(source.currentNotBefore.getTime()) : null,
    freshForMs: source.freshForMs,
    horizon: source.horizon,
    metric: {
      curve: [...source.metric.curve],
      definitionVersion: source.metric.definitionVersion,
      id: source.metric.id,
    },
    minimumRequestedDepth: source.minimumRequestedDepth,
    weightProvenance: {
      market: source.weightProvenance.market,
      period: source.weightProvenance.period,
      source: source.weightProvenance.source,
    },
  };
}
