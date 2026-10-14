import { businessMatcherVersion } from "@/lib/business-locations/dto";
import {
  objectValue,
  type RecordedMeasurementCheck,
  recordedMeasurement,
} from "@/lib/rank-measurements/recorded-check";
import type { MeasurementEvidence, MeasurementScope } from "@/lib/rank-measurements/types";

export function localScope(
  scope: MeasurementScope | null,
  identityRevisionId: string | null,
): MeasurementScope | null {
  if (!scope || scope.engine !== "google" || scope.surface !== "web_serp") return null;
  return {
    ...scope,
    resultKind: "local_pack",
    rankScale: "pack_slot",
    identityRevision:
      identityRevisionId === null ? null : `${identityRevisionId}:${businessMatcherVersion}`,
  };
}

/** Only retained per-kind depth proves absence. A count of returned items is never depth evidence. */
export function localBaseMeasurement(
  check: RecordedMeasurementCheck,
  targetId: string,
  projectId: string,
): MeasurementEvidence {
  const base = recordedMeasurement(check, targetId, projectId);
  const evidence = objectValue(objectValue(check.observationRun?.requestPolicy)?.evidence);
  const depth = evidence?.version === 1 ? objectValue(evidence.completeThrough)?.local_pack : null;
  return {
    ...base,
    configuredScope: localScope(base.configuredScope, null),
    effectiveScope: localScope(base.effectiveScope, null),
    position: null,
    completeThrough:
      typeof depth === "number" && Number.isSafeInteger(depth) && depth >= 0 ? depth : null,
  };
}
