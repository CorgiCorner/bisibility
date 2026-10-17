import type { ExecutionTargetV1, LocalSurface } from "@/lib/local-monitoring/types";
import type { readLocalHostRunInTransaction } from "@/lib/local-monitoring-host/read-transaction";
import type {
  EvidenceState,
  FreshnessReason,
  FreshnessState,
  MeasurementCounts,
  MeasurementReason,
} from "@/lib/rank-measurements/types";
export type LocalResultReceipt = Awaited<ReturnType<typeof readLocalHostRunInTransaction>>;
export type LocalHistoryWindow = Readonly<{
  from: string | null;
  to: string;
  timeBasis: "occurrence_created_at";
}>;
export type LocalFreshnessPolicy = Readonly<{
  basis: "manual_ttl" | "captured_calendar" | null;
  freshForMs: number | null;
  freshnessReason: FreshnessReason;
  policyEpoch: string | null;
  configurationRevision: string | null;
  semantics: "current_project_policy_with_original_intent";
}>;
export type LocalResultPoint = Readonly<{
  id: string;
  keywordId: string;
  keyword: string;
  ordinal: number;
  row: number;
  column: number;
  latitude: string;
  longitude: string;
  surface: LocalSurface;
  cutoff: number;
  zoom: number | null;
  language: string;
  device: ExecutionTargetV1["device"];
  operatingSystem: string | null;
  observedAt: string | null;
  recordedAt: string | null;
  position: number | null;
  observedPosition: number | null;
  evidence: EvidenceState;
  reason: MeasurementReason | null;
  freshness: FreshnessState;
  freshnessReason: FreshnessReason;
  identityMatch: "confirmed" | "candidate" | "rejected" | "unavailable";
  scopeClass: "coordinate_seed" | "coordinate_observed" | "unavailable";
  receipt: LocalResultReceipt["items"][number];
}>;
export type LocalResultGrid = Readonly<{
  /** The point evidence and receipts remain readable when this aggregate is incompatible. */
  reason?: "matcher_version_mixed";
  keywordId: string;
  keyword: string;
  gridRevisionKey: string;
  identityRevisionId: string;
  topN: number;
  size: 1 | 3 | 5 | 7;
  pointIds: readonly string[];
  expected: number;
  observedRate: number | null;
  observedCoverage: number | null;
  dataCoverage: number | null;
  sampleBounds: readonly [number, number] | null;
  counts: MeasurementCounts;
  freshness: FreshnessState;
  comparison: "unavailable";
  scope: "sampled_points";
}>;
export type LocalResultListing = Readonly<{
  id: string;
  name: string | null;
  rankGroup: number | null;
  rankAbsolute: number | null;
  promotion: "organic" | "promoted" | "unknown";
  observedAt: string | null;
  matched: "confirmed" | "candidate" | "rejected" | "unavailable";
  cid?: string | null;
  placeId?: string | null;
  sourcePage?: number | null;
  sourceBlockId?: string | null;
  sourceOrdinal?: number | null;
  rankScale?: string | null;
}>;
export type LocalMonitorRunResult = Readonly<{
  version: 1;
  projectId: string;
  monitorId: string;
  runId: string;
  asOf: string;
  createdAt: string;
  definitionRevisionId: string;
  definitionRevision: number;
  identityRevisionId: string;
  subject: string;
  protocol: Readonly<{
    geometry: string;
    matcher: string;
    normalizerVersions: readonly string[];
    metricDefinition: string;
  }>;
  financialBasis: "current_accounting_state";
  freshnessPolicy?: LocalFreshnessPolicy;
  receipt: LocalResultReceipt;
  points: readonly LocalResultPoint[];
  grids: readonly LocalResultGrid[];
}>;
export type LocalMonitorRunHistory = Readonly<{
  version: 1;
  projectId: string;
  monitorId: string;
  asOf: string;
  window?: LocalHistoryWindow;
  eligibleTotal?: number;
  items: readonly Readonly<{
    runId: string;
    createdAt: string;
    definitionRevision: number;
    mode: string;
  }>[];
  nextCursor: string | null;
}>;

export type LocalPointHistory = Readonly<{
  version: 1;
  asOf: string;
  targetId: string;
  scope: "exact_captured_target";
  limit: 20;
  hasMore: boolean;
  nextCursor?: string | null;
  window?: LocalHistoryWindow;
  eligibleTotal?: number;
  policyEpoch?: string | null;
  freshnessConfigurationRevision?: string | null;
  items: readonly Readonly<{
    id: string;
    runId: string;
    createdAt: string;
    observedAt: string | null;
    position: number | null;
    evidence: EvidenceState;
    reason: MeasurementReason | null;
    freshness?: FreshnessState;
    freshnessReason?: FreshnessReason;
  }>[];
}>;
