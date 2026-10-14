export type EvidenceState =
  | "positive"
  | "known_absent"
  | "unknown"
  | "unsupported"
  | "not_observed";
export type FreshnessState = "fresh" | "stale" | "unknown";
export type FreshnessReason =
  | "policy_unavailable"
  | "missing_observation_time"
  | "invalid_policy"
  | null;
export type MeasurementScope = {
  projectId: string;
  targetId: string;
  targetRevision: string | null;
  engine: string;
  surface: string;
  resultKind: string;
  rankScale: string;
  location: string;
  language: string;
  device: string;
  policyRevision?: string | null;
  identityRevision?: string | null;
};
export type MeasurementEvidence = {
  id: string;
  targetId: string;
  execution: string;
  position: number | null;
  requestedDepth: number | null;
  normalizationVersion: string | null;
  provider: string | null;
  configuredScope: MeasurementScope | null;
  effectiveScope: MeasurementScope | null;
  completeness: "complete" | "truncated" | "unknown";
  completeThrough: number | null;
  observedAt: Date | null;
  recordedAt: Date;
  requestedAt: Date | null;
  supported?: boolean;
};
export type MeasurementPolicy = {
  asOf: Date;
  horizon: number;
  minimumRequestedDepth?: number;
  freshForMs?: number | null;
  expectedScope?: MeasurementScope | null;
  /** Current KPI adapters require independent active-definition proof; history may use captured scope. */
  requireCurrentScope?: boolean;
  requestedGeo?: Partial<Pick<MeasurementScope, "location" | "language" | "device">>;
  currentNotBefore?: Date;
  /** False means the host could not prove a comparison window, not latest-previous fallback. */
  baselineEnabled?: boolean;
  baselineBefore?: Date;
  baselineNotBefore?: Date;
};
export type MeasurementReason =
  | "not_completed"
  | "unsupported"
  | "missing_scope"
  | "scope_mismatch"
  | "missing_normalization"
  | "invalid_position"
  | "insufficient_depth"
  | "current_scope_unavailable"
  | "unproven_absence"
  | "future_observation"
  | "missing_observation_time";
export type QualifiedMeasurement = {
  measurement: MeasurementEvidence;
  evidence: EvidenceState;
  position: number | null;
  comparisonKey: string | null;
  freshness: FreshnessState;
  freshnessReason: FreshnessReason;
  reason: MeasurementReason | null;
};
export type MovementEvent =
  | "first"
  | "entered"
  | "exited"
  | "re_entered"
  | "moved"
  | "steady"
  | "unknown";
export type ResolvedMeasurement = {
  latestAttempt: MeasurementEvidence | null;
  current: QualifiedMeasurement | null;
  baseline: QualifiedMeasurement | null;
  lastSuccess: QualifiedMeasurement | null;
  boundary: QualifiedMeasurement | null;
  event: MovementEvent;
  movement: number | null;
};
export type MeasurementCounts = {
  expected: number;
  measured: number;
  metricEligible: number;
  ranked: number;
  knownAbsent: number;
  unknown: number;
  neverChecked: number;
  failed: number;
  stale: number;
  unsupported: number;
  freshDeterminate: number | null;
  unknownFreshness: number;
  comparable: number;
};
export type MeasurementTarget = {
  id: string;
  current: QualifiedMeasurement | null;
  baseline: QualifiedMeasurement | null;
  latestAttempt?: MeasurementEvidence | null;
  volume: number | null;
};
export type MeasurementReport = {
  metricId: string;
  definitionVersion: string;
  asOf: string;
  value: number | null;
  delta: number | null;
  counts: MeasurementCounts;
  dataCoverage: number | null;
  observedCoverage: number | null;
  freshness: FreshnessState;
  freshnessReason: FreshnessReason;
  imputedWeightShare: number | null;
  contributions: Array<{
    targetId: string;
    weight: number;
    value: number | null;
    delta: number | null;
  }>;
  exclusions: Array<{ targetId: string; reason: string }>;
  added: string[] | null;
  removed: string[] | null;
  compositionReason: "baseline_membership_unavailable" | null;
  weightProvenance: { source: string | null; period: string | null; market: string | null };
  includedCount: number;
  eligibleTotal: number;
  isTruncated: boolean;
};
