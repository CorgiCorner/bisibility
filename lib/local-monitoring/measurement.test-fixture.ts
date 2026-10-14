import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import type {
  MeasurementEvidence,
  MeasurementPolicy,
  MeasurementTarget,
} from "@/lib/rank-measurements/types";
import { localFixtureNow, localSelectionFixture } from "./fixtures";

export function gridMeasurementFixture(freshnessConfigured = true) {
  const { selection } = localSelectionFixture(5);
  const policy: MeasurementPolicy = {
    asOf: localFixtureNow,
    horizon: 10,
    freshForMs: freshnessConfigured ? 60 * 60 * 1000 : null,
  };
  const targets: MeasurementTarget[] = selection.targets.map(({ key, target }, index) => {
    const scope = {
      projectId: target.projectId,
      targetId: key,
      targetRevision: target.keywordRevision,
      engine: target.engine,
      surface: target.surface,
      resultKind: target.resultKind,
      rankScale: target.rankScale,
      location: target.pointRevision,
      language: target.language,
      device: target.device,
      policyRevision: target.policyRevision,
    };
    const evidence: MeasurementEvidence = {
      id: `synthetic-observation-${index}`,
      targetId: key,
      execution: "completed",
      position: index < 10 ? 3 : null,
      requestedDepth: target.cutoff,
      normalizationVersion: "synthetic-local-normalization-v1",
      provider: "synthetic",
      configuredScope: scope,
      effectiveScope: scope,
      completeness: index < 20 ? "complete" : "unknown",
      completeThrough: index < 20 ? 20 : null,
      observedAt: new Date("2026-10-12T11:30:00.000Z"),
      recordedAt: new Date("2026-10-12T11:31:00.000Z"),
      requestedAt: new Date("2026-10-12T11:29:00.000Z"),
    };
    return {
      id: key,
      current: qualifyMeasurement(evidence, policy),
      baseline: null,
      latestAttempt: evidence,
      volume: 999,
    };
  });
  return {
    selection,
    targets,
    policy: { asOf: localFixtureNow, curve: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], freshnessConfigured },
  };
}
