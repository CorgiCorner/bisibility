import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import { reportDigest } from "./digest";
import type {
  RankReportPolicy,
  RankReportTarget,
  ReportPageKey,
  RetainedObservationItem,
} from "./model";
import { targetReportFreshForMs } from "./policy";

function publicScope(scope: MeasurementScope | null) {
  if (!scope) return null;
  return {
    device: scope.device,
    engine: scope.engine,
    identityRevision: scope.identityRevision ?? null,
    language: scope.language,
    location: scope.location,
    policyRevision: scope.policyRevision ?? null,
    rankScale: scope.rankScale,
    resultKind: scope.resultKind,
    surface: scope.surface,
    targetRevision: scope.targetRevision,
  };
}

/** Raw provider errors are not report data; only a bounded machine code is exposed. */
function publicCode(value: string | null) {
  return value && /^[a-z0-9_.:-]{1,128}$/i.test(value) ? value : null;
}

export function rankReportRecords(
  targets: readonly RankReportTarget[],
  policy: RankReportPolicy,
  kernelProjectId: string,
  qualification: "report_scope" | "retained_scope" = "report_scope",
) {
  return targets.flatMap((target) =>
    target.checks.map((check) => {
      const evidence = recordedMeasurement(check, target.id, kernelProjectId);
      const qualified = qualifyMeasurement(evidence, {
        asOf: policy.asOf,
        expectedScope: qualification === "retained_scope" ? undefined : target.expectedScope,
        freshForMs: targetReportFreshForMs(target, policy),
        horizon: policy.horizon,
        minimumRequestedDepth: policy.minimumRequestedDepth ?? undefined,
        requestedGeo: qualification === "retained_scope" ? undefined : target.requestedGeo,
      });
      const times = {
        checkedAt: check.checkedAt.toISOString(),
        checkRecordedAt: check.createdAt.toISOString(),
        observedAt: evidence.observedAt?.toISOString() ?? null,
        recordedAt: evidence.recordedAt.toISOString(),
        requestedAt: evidence.requestedAt?.toISOString() ?? null,
      };
      const key: ReportPageKey = { at: evidence.recordedAt.toISOString(), id: check.id };
      return {
        attempt: {
          ...times,
          deferredReason: publicCode(check.deferredReason),
          errorCode: publicCode(check.errorCode),
          finishedAt: check.finishedAt?.toISOString() ?? null,
          id: check.id,
          keywordId: target.id,
          kind: "logical_rank_check" as const,
          provider: check.provider ?? null,
          recordedAt: check.createdAt.toISOString(),
          reportedProviderAttemptCount: check.attemptCount,
          startedAt: check.startedAt?.toISOString() ?? null,
          status: check.status,
        },
        items:
          check.status === "completed"
            ? (check.observationRun?.items ?? []).map((item) =>
                normalizedItem(item, check.id, target.id, times),
              )
            : [],
        key,
        observation:
          check.status === "completed"
            ? {
                ...times,
                comparisonDigest: qualified.comparisonKey
                  ? reportDigest(qualified.comparisonKey)
                  : null,
                completeThrough: evidence.completeThrough,
                completeness: evidence.completeness,
                configuredScope: publicScope(evidence.configuredScope),
                effectiveScope: publicScope(evidence.effectiveScope),
                evidence: qualified.evidence,
                expectedUrlAtCheck: check.expectedUrlAtCheck,
                freshness: qualified.freshness,
                freshnessAsOf: policy.asOf.toISOString(),
                freshnessReason: qualified.freshnessReason,
                id: check.id,
                keywordId: target.id,
                normalizationVersion: evidence.normalizationVersion,
                position: qualified.evidence === "positive" ? qualified.position : null,
                provider: evidence.provider,
                rankingUrl: check.rankingUrl,
                reason: qualified.reason,
                reportedPosition: check.position,
                requestedDepth: evidence.requestedDepth,
              }
            : null,
      };
    }),
  );
}

function normalizedItem(
  item: RetainedObservationItem,
  checkId: string,
  keywordId: string,
  times: {
    checkedAt: string;
    checkRecordedAt: string;
    observedAt: string | null;
    recordedAt: string;
    requestedAt: string | null;
  },
) {
  return {
    ...times,
    blockPosition: item.blockPosition,
    businessName: item.businessName,
    checkId,
    cid: retainedObservationCid(item.cid),
    domain: item.domain,
    id: `${checkId}:item:${reportDigest(item.id)}`,
    keywordId,
    mapsUrl: item.mapsUrl,
    rankScale: item.rankScale ?? null,
    promotion: item.promotion ?? null,
    sourcePage: item.sourcePage ?? null,
    sourceBlockId: item.sourceBlockId ?? null,
    sourceOrdinal: item.sourceOrdinal ?? null,
    sourceObservedAt: item.observedAt?.toISOString() ?? null,
    ordinal: item.ordinal,
    placeId: item.placeId,
    positionInBlock: item.positionInBlock,
    rankAbsolute: item.rankAbsolute,
    rankGroup: item.rankGroup,
    recordedAt: item.createdAt.toISOString(),
    resultKind: item.resultKind,
    title: item.title,
    url: item.url,
  };
}

/** A numeric CID cannot prove its original bytes, even if it appears representable. */
export function retainedObservationCid(value: unknown) {
  return typeof value === "string" ? value : null;
}

export type RankReportAttempt = ReturnType<typeof rankReportRecords>[number]["attempt"];
export type RankReportObservation = NonNullable<
  ReturnType<typeof rankReportRecords>[number]["observation"]
>;
export type RankReportItem = ReturnType<typeof rankReportRecords>[number]["items"][number];
export type RankReportRecord = RankReportAttempt | RankReportObservation | RankReportItem;
