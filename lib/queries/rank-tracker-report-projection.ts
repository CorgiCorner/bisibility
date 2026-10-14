import type { RankReportPolicy } from "@/lib/rank-reports/model";
import { rankReportRecords } from "@/lib/rank-reports/records";
import { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import { pathFromUrl } from "./keyword-row-format";
import type { KeywordRow } from "./keyword-row-types";
import type { RankTrackerCurrentTarget, RankTrackerQualityRow } from "./rank-tracker-report-model";

/** Legacy numeric transport fields are compatibility only; quality owns all predicates and metrics. */
export function projectRankTrackerQuality<Row extends KeywordRow>(
  row: Row,
  target: RankTrackerCurrentTarget,
  policy: RankReportPolicy,
  projectId: string,
): Omit<Row, keyof RankTrackerQualityRow> & RankTrackerQualityRow {
  const quality = rankReportTargetResolution(target, policy);
  const lastKnown = rankReportTargetResolution(target.historicalResolution, {
    ...policy,
    baseline: { mode: "none" },
  });
  const check = target.checks.find(({ id }) => id === quality.current?.id);
  const records = rankReportRecords(
    [
      {
        checks: target.checks,
        freshForMs: target.freshForMs,
        id: target.id,
        volume: target.volume,
      },
    ],
    policy,
    projectId,
  );
  const points = records.flatMap(({ observation }) => (observation ? [observation] : []));
  const latestAttempt = records.find(
    ({ attempt }) => attempt.id === quality.latestAttempt?.id,
  )?.attempt;
  const historicalBoundary = target.historicalResolution.resolution.boundary?.measurement;
  const historyBoundaryTime = (
    historicalBoundary?.observedAt ?? historicalBoundary?.recordedAt
  )?.toISOString();
  const historyPoint = lastKnown.current?.comparisonDigest
    ? lastKnown.current
    : (lastKnown.lastSuccess ?? lastKnown.current);
  const historyPointTime = historyPoint?.observedAt ?? historyPoint?.recordedAt;
  const activeBoundary =
    historyBoundaryTime &&
    historyPointTime &&
    Date.parse(historyBoundaryTime) < Date.parse(historyPointTime)
      ? historyBoundaryTime
      : null;
  const capturedHistory = points.find((point) => point.id === historyPoint?.id);
  const compatible = historyPoint?.comparisonDigest
    ? points.filter(
        (point) =>
          point.comparisonDigest === historyPoint.comparisonDigest &&
          (!activeBoundary ||
            Date.parse(point.observedAt ?? point.recordedAt) > Date.parse(activeBoundary)),
      )
    : [];
  const history = compatible
    .filter((point) => point.evidence === "positive" && point.position !== null)
    .sort(
      (a, b) =>
        Date.parse(a.observedAt ?? a.recordedAt) - Date.parse(b.observedAt ?? b.recordedAt) ||
        a.id.localeCompare(b.id),
    );
  const urls = new Set(compatible.flatMap((point) => (point.rankingUrl ? [point.rankingUrl] : [])));
  const positive = quality.current?.evidence === "positive" ? quality.current.position : null;
  const baseline =
    quality.movement !== null && quality.baseline?.evidence === "positive"
      ? quality.baseline.position
      : null;
  const execution = quality.latestAttempt?.status;
  const state =
    execution === "failed" || execution === "running"
      ? execution
      : !quality.latestAttempt
        ? "never_checked"
        : positive !== null
          ? "ranked"
          : quality.current?.evidence === "known_absent"
            ? "not_ranked"
            : "unknown";
  return {
    ...row,
    bestPosition: history.reduce<number | null>(
      (best, point) =>
        point.position === null
          ? best
          : best === null
            ? point.position
            : Math.min(best, point.position),
      null,
    ),
    checkState: state,
    completedComparableChecks: [],
    dataAsOfAt: quality.current?.observedAt ?? null,
    dataProvider: quality.current?.provider ?? null,
    expectedUrl: check?.expectedUrlAtCheck ?? null,
    expectedUrlFallbackCurrent: false,
    hasRankData: positive !== null,
    lastCheckAt: quality.latestAttempt?.recordedAt ?? null,
    lastCheckErrorCode: latestAttempt?.errorCode ?? null,
    lastCheckStatus:
      execution === "failed" || execution === "running" || execution === "completed"
        ? execution
        : null,
    latestAttemptHealth: execution === "failed" || execution === "running" ? execution : "ok",
    position: positive ?? 101,
    positionBaseline: baseline,
    previousPosition: baseline,
    positionHistory: history.flatMap((point) =>
      point.position === null
        ? []
        : [
            {
              checkedAt: point.checkedAt,
              label: (point.observedAt ?? point.recordedAt).slice(0, 10),
              position: point.position,
              rankingUrl: point.rankingUrl,
            },
          ],
    ),
    positionHistoryBoundaryAt: historyBoundaryTime ?? null,
    positionObservations: [],
    rankQuality: {
      ...quality,
      currentScopeReason:
        target.currentScopeState === "unavailable" ? "current_scope_unavailable" : null,
      currentScopeState: target.currentScopeState,
      lastKnown,
      lastKnownScopes: capturedHistory
        ? {
            configuredScope: capturedHistory.configuredScope,
            effectiveScope: capturedHistory.effectiveScope,
          }
        : null,
    },
    rankingPages: urls.size,
    rankingPath: quality.current?.rankingUrl ? pathFromUrl(quality.current.rankingUrl) : null,
    rankingUrl: quality.current?.rankingUrl ?? null,
    rankingUrlHistory: [],
    sparkline: history.flatMap((point) => (point.position !== null ? [point.position] : [])),
  };
}
