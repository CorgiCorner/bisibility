import { measurement } from "./fixtures";
import type { MeasurementEvidence } from "./types";

export function recordedFixture(
  position: number | null,
  changes: Partial<MeasurementEvidence> = {},
) {
  const value = measurement(position, changes);
  const scope = value.configuredScope;
  return {
    id: value.id,
    checkedAt: value.recordedAt,
    position,
    previousPosition: null,
    normalizationVersion: value.normalizationVersion,
    requestedDepth: value.requestedDepth,
    provider: value.provider ?? "synthetic",
    status: value.execution,
    rankingUrl: null,
    observationRun: {
      projectId: scope?.projectId ?? "project-a",
      completeness: value.completeness,
      configuredScope: scope,
      effectiveScope: value.effectiveScope,
      provider: value.provider ?? "synthetic",
      engine: "google",
      surface: "web_serp",
      createdAt: value.recordedAt,
      executedAt: value.recordedAt,
      requestPolicy: {
        evidence: {
          version: 1,
          targetRevision: scope?.targetRevision ?? null,
          policyRevision: scope?.policyRevision ?? null,
          observedAt: value.observedAt?.toISOString() ?? null,
          completeThrough: { organic_result: value.completeThrough },
        },
      },
    },
  };
}
