import type { MeasurementEvidence, MeasurementPolicy, MeasurementScope } from "./types";

export const fixtureAsOf = new Date("2026-10-12T12:00:00.000Z");
export const fixtureScope: MeasurementScope = {
  projectId: "project-a",
  targetId: "target-a",
  targetRevision: "target-v1",
  engine: "google",
  surface: "web_serp",
  resultKind: "organic_result",
  rankScale: "organic_group",
  location: "City A",
  language: "en",
  device: "desktop",
  policyRevision: "policy-v1",
};
export const fixturePolicy: MeasurementPolicy = {
  asOf: fixtureAsOf,
  horizon: 20,
  minimumRequestedDepth: 20,
  freshForMs: 3 * 24 * 60 * 60 * 1000,
};
export function measurement(
  position: number | null,
  overrides: Partial<MeasurementEvidence> = {},
): MeasurementEvidence {
  return {
    id: "check-current",
    targetId: "target-a",
    execution: "completed",
    position,
    requestedDepth: 100,
    normalizationVersion: "normalization-v1",
    provider: "synthetic",
    configuredScope: fixtureScope,
    effectiveScope: fixtureScope,
    completeness: "complete",
    completeThrough: 100,
    observedAt: new Date("2026-10-12T10:00:00.000Z"),
    recordedAt: new Date("2026-10-12T10:01:00.000Z"),
    requestedAt: new Date("2026-10-12T09:59:00.000Z"),
    ...overrides,
  };
}
