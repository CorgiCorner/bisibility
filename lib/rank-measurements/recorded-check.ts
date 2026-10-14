import type { MeasurementEvidence, MeasurementScope } from "./types";

export type CapturedObservation = {
  projectId?: string;
  completeness: string;
  configuredScope?: unknown;
  effectiveScope?: unknown;
  requestPolicy?: unknown;
  provider?: string;
  surface?: string;
  engine?: string;
  executedAt?: Date;
  createdAt?: Date;
};
export type RecordedMeasurementCheck = {
  id?: string;
  createdAt?: Date;
  checkedAt?: Date;
  normalizationVersion: string | null;
  observationRun?: CapturedObservation | null;
  position: number | null;
  requestedDepth: number | null;
  status?: string;
  provider?: string | null;
  degradedToCountry?: boolean;
};

export function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function capturedScope(
  value: unknown,
  observation: CapturedObservation,
  meta: Record<string, unknown> | null,
  targetId: string,
  projectId: string,
): MeasurementScope | null {
  const scope = objectValue(value);
  // This adapter interprets a legacy organic RankCheck, never a point-surface observation.
  if (observation.surface !== "web_serp" || observation.engine !== "google") return null;
  const location = stringValue(scope?.location),
    language = stringValue(scope?.language),
    device = stringValue(scope?.device);
  if (!location || !language || !device || !observation.surface || !observation.engine) return null;
  return {
    projectId,
    targetId,
    targetRevision: stringValue(meta?.targetRevision),
    engine: observation.engine,
    surface: observation.surface,
    resultKind: "organic_result",
    rankScale: "organic_group",
    location,
    language,
    device,
    policyRevision: stringValue(meta?.policyRevision),
    identityRevision: stringValue(meta?.identityRevision),
  };
}

/** Only immutable captured scope supplies history qualification; current Keyword settings do not. */
export function recordedMeasurement(
  check: RecordedMeasurementCheck,
  targetId: string,
  requestedProjectId?: string,
): MeasurementEvidence {
  const observation = check.observationRun;
  const projectId = observation?.projectId ?? requestedProjectId ?? "";
  const metadata = objectValue(objectValue(observation?.requestPolicy)?.evidence);
  const validMetadata = metadata?.version === 1 ? metadata : null;
  const through = objectValue(validMetadata?.completeThrough)?.organic_result;
  const configuredScope = observation
    ? capturedScope(observation.configuredScope, observation, validMetadata, targetId, projectId)
    : null;
  const effective = observation?.effectiveScope;
  const effectiveScope =
    effective == null
      ? null
      : observation
        ? capturedScope(effective, observation, validMetadata, targetId, projectId)
        : null;
  const foreignProject =
    requestedProjectId && observation?.projectId && requestedProjectId !== observation.projectId;
  const recordedAt = observation?.createdAt ?? check.createdAt ?? check.checkedAt ?? new Date(0);
  return {
    id: check.id ?? `${targetId}:${recordedAt.toISOString()}`,
    targetId,
    execution: check.status ?? "completed",
    position: check.position,
    requestedDepth: check.requestedDepth,
    normalizationVersion: check.normalizationVersion,
    provider: observation?.provider ?? check.provider ?? null,
    configuredScope: foreignProject ? null : configuredScope,
    effectiveScope: foreignProject ? null : effectiveScope,
    completeness:
      observation?.completeness === "complete"
        ? "complete"
        : observation?.completeness === "truncated_by_stop_on_match"
          ? "truncated"
          : "unknown",
    completeThrough:
      typeof through === "number" && Number.isSafeInteger(through) && through >= 0 ? through : null,
    observedAt: timestamp(validMetadata?.observedAt),
    recordedAt,
    requestedAt: timestamp(validMetadata?.requestedAt),
  };
}
