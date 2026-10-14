import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import {
  type RecordedMeasurementCheck,
  recordedMeasurement,
} from "@/lib/rank-measurements/recorded-check";
import { semanticRequestedGeo } from "@/lib/rank-measurements/requested-geo";
import { resolveMeasurements } from "@/lib/rank-measurements/resolve";
import type { MeasurementPolicy, QualifiedMeasurement } from "@/lib/rank-measurements/types";
import {
  VISIBILITY_DEFINITION_VERSION_V1,
  VISIBILITY_HORIZON,
  VISIBILITY_METRIC_ID_V1,
  VISIBILITY_POSITION_WEIGHTS_V1,
} from "@/lib/visibility/definition";

export { VISIBILITY_HORIZON, VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";

export type VisibilitySnapshot = {
  id: string;
  current: QualifiedMeasurement | null;
  previous: QualifiedMeasurement | null;
  latestAttempt?: ReturnType<typeof recordedMeasurement> | null;
  volume: number | null;
};
export type VisibilitySummary = {
  comparableKeywordCount: number;
  delta: number | null;
  measuredKeywordCount: number;
  value: number | null;
  report: ReturnType<typeof aggregateMeasurements>;
};

export function visibilitySnapshotFor(
  keyword: {
    id: string;
    publicId?: string;
    projectId?: string;
    device?: string;
    measurementPolicy?: Partial<MeasurementPolicy>;
    locationRef?: { displayName: string; languageCode?: string | null };
    rankChecks: readonly RecordedMeasurementCheck[];
  },
  volume: number | null = null,
  options: Partial<MeasurementPolicy> = {},
): VisibilitySnapshot {
  const id = keyword.publicId ?? keyword.id;
  const policy = { ...keyword.measurementPolicy, ...options };
  const resolved = resolveMeasurements(
    keyword.rankChecks.map((check) => recordedMeasurement(check, id, keyword.projectId)),
    {
      ...keyword.measurementPolicy,
      ...options,
      asOf: options.asOf ?? new Date(),
      horizon: VISIBILITY_HORIZON,
      minimumRequestedDepth: VISIBILITY_HORIZON,
      requestedGeo: semanticRequestedGeo(
        policy,
        keyword.locationRef
          ? {
              location: keyword.locationRef.displayName,
              ...(keyword.locationRef.languageCode
                ? { language: keyword.locationRef.languageCode }
                : {}),
              device: keyword.device,
            }
          : undefined,
      ),
    },
  );
  return {
    id,
    current: resolved.current,
    previous: resolved.baseline,
    latestAttempt: resolved.latestAttempt,
    volume,
  };
}

export function summarizeVisibility(
  snapshots: readonly VisibilitySnapshot[],
  options: { asOf?: Date; eligibleTotal?: number; freshnessConfigured?: boolean } = {},
): VisibilitySummary {
  const report = aggregateMeasurements(
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      current: snapshot.current,
      baseline: snapshot.previous,
      latestAttempt: snapshot.latestAttempt,
      volume: snapshot.volume,
    })),
    {
      metricId: VISIBILITY_METRIC_ID_V1,
      definitionVersion: VISIBILITY_DEFINITION_VERSION_V1,
      asOf: options.asOf ?? new Date(),
      curve: VISIBILITY_POSITION_WEIGHTS_V1,
      eligibleTotal: options.eligibleTotal,
      freshnessConfigured: options.freshnessConfigured,
    },
  );
  return {
    comparableKeywordCount: report.counts.comparable,
    delta: report.delta,
    measuredKeywordCount: report.counts.metricEligible,
    value: report.value,
    report,
  };
}
