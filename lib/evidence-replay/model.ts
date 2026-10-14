import type { Actor } from "@/lib/auth/authorize";
import type { OrganicDomainRank } from "@/lib/rank-check/organic-ranks";

export const ORGANIC_EVIDENCE_REPLAY_VERSION = "organic-domain-ranks-replay-v1";
export const REPLAY_LIMITS = {
  maxRows: 10_000,
  manifestBytes: 8_388_608,
  sourceBytes: 1_048_576,
  batchBytes: 16_777_216,
  batchSize: 200,
} as const;
export type ReplayDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};
/** Trusted host transport context, never parsed from request JSON. CLI can only use its actual DB principal. */
export type ReplayAuthority = { kind: "session"; actor: Actor } | { kind: "database_operator" };
export type ReplayPrincipal = {
  kind: ReplayAuthority["kind"];
  reference: string;
  projectId: string;
  projectPublicId: string;
};
export type ReplayRequest = {
  projectId: string;
  from: string;
  to: string;
  maxRows: number;
  batchSize: number;
};
export type ReplayCandidate = {
  checkId: string;
  checkPublicId: string;
  keywordId: string;
  keywordPublicId: string;
  /** Physical retained checkedAt wall-time, not a manufactured provider instant. */
  checkedAtText: string;
  createdAtText: string;
  status: string;
  provider: string;
  normalizationVersion: string | null;
  requestedDepth: number | null;
  rawBytes: number;
  rawHash: string;
  storedHash: string;
  observationHash: string | null;
};
export type ReplaySource = ReplayCandidate & {
  rawText: string | null;
  storedText: string | null;
  observation: unknown;
};
export type ReplayExclusion =
  | "not_completed"
  | "projection_present"
  | "raw_expired"
  | "unrecognized_container"
  | "source_too_large"
  | "unsupported_provider"
  | "invalid_source_id"
  | "retained_owner_unavailable"
  | "source_missing";
export type ReplayEvaluation = {
  status: "applied" | ReplayExclusion;
  facts: OrganicDomainRank[] | null;
  sourceKind: "legacy_root_raw" | "retained_observation" | "unavailable";
  retainedObservedAt: string | null;
  outputHash: string | null;
  qualification: "retained_facts_only";
};
export type ReplayCounts = {
  scanned: number;
  applied: number;
  excluded: number;
  projectionPresent: number;
};
export type ReplayRun = {
  id: string;
  projectId: string;
  projectPublicId: string;
  principal: ReplayPrincipal;
  request: ReplayRequest;
  parserVersion: string;
  codeHash: string;
  manifestHash: string;
  manifest: ReplayCandidate[];
  cursor: number;
  revision: number;
  counts: ReplayCounts;
  state: "running" | "completed" | "stopped";
  snapshotAt: string;
};
export class EvidenceReplayConflictError extends Error {
  constructor() {
    super("evidence_replay_conflict");
  }
}
export class EvidenceReplayCapacityError extends Error {
  constructor() {
    super("evidence_replay_capacity");
  }
}
export class EvidenceReplayUnavailableError extends Error {
  constructor() {
    super("evidence_replay_unavailable");
  }
}
