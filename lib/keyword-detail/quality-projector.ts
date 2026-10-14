import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { projectRankTrackerQuality } from "@/lib/queries/rank-tracker-report-projection";
import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { reportDigest } from "@/lib/rank-reports/digest";
import { RankReportSelectionError } from "@/lib/rank-reports/errors";
import type { RankReportPolicy, RankReportTarget } from "@/lib/rank-reports/model";
import { targetReportFreshForMs } from "@/lib/rank-reports/policy";
import type { KeywordDetailQuality } from "./quality-model";
import type { KeywordDetailRankState } from "./state-model";

/** Best is a minimum of kernel-qualified positives for ONE selected captured comparison key. */
function retainedBest(
  target: RankReportTarget,
  policy: RankReportPolicy,
  projectId: string,
  current: ReturnType<typeof resolveCurrentRankTrackerTargets>[number],
): KeywordDetailQuality["best"] {
  const currentDefinition = current.currentScopeState === "verified";
  const resolution = currentDefinition
    ? current.resolution
    : current.historicalResolution.resolution;
  const key = resolution.current?.comparisonKey ?? resolution.lastSuccess?.comparisonKey;
  if (!key) return null;
  const points = target.checks
    .map((check) =>
      qualifyMeasurement(recordedMeasurement(check, target.id, projectId), {
        asOf: policy.asOf,
        freshForMs: targetReportFreshForMs(target, policy),
        horizon: policy.horizon,
        minimumRequestedDepth: policy.minimumRequestedDepth ?? undefined,
        ...(currentDefinition
          ? {
              expectedScope: target.expectedScope,
              requestedGeo: target.requestedGeo,
              requireCurrentScope: true,
            }
          : {}),
      }),
    )
    .filter(
      (point) =>
        point.measurement.recordedAt <= policy.asOf &&
        point.comparisonKey === key &&
        point.evidence === "positive" &&
        point.position !== null &&
        point.measurement.observedAt !== null,
    );
  const best = points
    .slice()
    .sort(
      (a, b) =>
        (a.position ?? Infinity) - (b.position ?? Infinity) ||
        (a.measurement.observedAt?.getTime() ?? 0) - (b.measurement.observedAt?.getTime() ?? 0) ||
        a.measurement.id.localeCompare(b.measurement.id),
    )[0];
  if (!best || best.position === null || !best.measurement.observedAt) return null;
  return {
    comparisonDigest: reportDigest(key),
    definitionOrigin: currentDefinition ? "current_definition" : "last_known_definition",
    id: best.measurement.id,
    observedAt: best.measurement.observedAt.toISOString(),
    position: best.position,
    provider: best.measurement.provider,
    qualifyingCount: points.length,
    recordedAt: best.measurement.recordedAt.toISOString(),
  };
}

/** Called synchronously with the report snapshot; the legacy row contributes editable/context fields only. */
export function projectKeywordDetailQuality<Row extends KeywordRow>(
  row: Row,
  targets: readonly RankReportTarget[],
  policy: RankReportPolicy,
  projectId: string,
  sourceDigest: string,
) {
  if (targets.length !== 1 || targets[0].id !== row.id) throw new RankReportSelectionError();
  const target = targets[0];
  const current = resolveCurrentRankTrackerTargets(targets, policy, projectId)[0];
  const projectedRow = projectRankTrackerQuality(row, current, policy, projectId);
  const best = retainedBest(target, policy, projectId, current);
  const quality: KeywordDetailQuality = {
    asOf: policy.asOf.toISOString(),
    best,
    definitionVersion: policy.metric.definitionVersion,
    expectedScope: target.expectedScope
      ? {
          device: target.expectedScope.device,
          engine: target.expectedScope.engine,
          language: target.expectedScope.language,
          location: target.expectedScope.location,
          policyRevision: target.expectedScope.policyRevision ?? null,
          identityRevision: target.expectedScope.identityRevision ?? null,
          rankScale: target.expectedScope.rankScale,
          resultKind: target.expectedScope.resultKind,
          surface: target.expectedScope.surface,
          targetRevision: target.expectedScope.targetRevision,
        }
      : null,
    keywordId: target.id,
    latestAttemptProvider:
      target.checks.find((check) => check.id === projectedRow.rankQuality.latestAttempt?.id)
        ?.provider ?? null,
    rankQuality: projectedRow.rankQuality,
    retainedChecks: target.checks.length,
    sourceDigest,
  };
  return { quality, row: { ...projectedRow, bestPosition: best?.position ?? null } };
}

export function keywordDetailRankState(quality: KeywordDetailQuality): KeywordDetailRankState {
  const current = quality.rankQuality.current;
  if (current?.evidence === "positive" && current.position !== null) return "normal";
  if (current?.evidence === "known_absent") return "not_ranked";
  if (quality.rankQuality.latestAttempt?.status === "failed") return "failed";
  if (quality.rankQuality.latestAttempt?.status === "running") return "running";
  return quality.rankQuality.latestAttempt ? "unknown" : "never_checked";
}
