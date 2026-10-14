import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import type { RankReportPolicy, RankReportTarget } from "@/lib/rank-reports/model";
import { targetReportBaseline, targetReportFreshForMs } from "@/lib/rank-reports/policy";
import { resolveRankReportTargets } from "@/lib/rank-reports/summary";
import type { RankTrackerCurrentTarget } from "./rank-tracker-report-model";

/** Current-definition KPI and retained history intentionally use different scope requirements. */
export function resolveCurrentRankTrackerTargets(
  targets: readonly RankReportTarget[],
  policy: RankReportPolicy,
  projectId: string,
): RankTrackerCurrentTarget[] {
  const historical = resolveRankReportTargets(
    targets.map((target) => ({ ...target, expectedScope: undefined, requestedGeo: undefined })),
    policy,
    projectId,
  );
  const byId = new Map(historical.map((target) => [target.id, target]));
  return targets.map((target) => {
    const historicalResolution = byId.get(target.id);
    if (!historicalResolution) throw new Error("Missing retained historical resolution");
    return {
      checks: target.checks,
      comparisonRequested: policy.baseline.mode === "before",
      ...(target.baselineWindow !== undefined ? { baselineWindow: target.baselineWindow } : {}),
      freshForMs: targetReportFreshForMs(target, policy),
      currentScopeState: target.expectedScope?.targetRevision ? "verified" : "unavailable",
      historicalResolution,
      id: target.id,
      volume: target.volume,
      resolution: resolveMeasurements(
        target.checks.map((check) => recordedMeasurement(check, target.id, projectId)),
        {
          asOf: policy.asOf,
          ...targetReportBaseline(target, policy),
          currentNotBefore: policy.currentNotBefore ?? undefined,
          expectedScope: target.expectedScope,
          freshForMs: targetReportFreshForMs(target, policy),
          horizon: policy.horizon,
          minimumRequestedDepth: policy.minimumRequestedDepth ?? undefined,
          requestedGeo: target.requestedGeo,
          requireCurrentScope: true,
        },
      ),
    };
  });
}
