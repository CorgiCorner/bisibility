import type { RecoveryErrorCode } from "@/lib/provider-usage/recovery-error";

export const TRIAGE_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "waiting_evidence",
  "escalated",
] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];
export type RecoveryAction = "recover_proof" | "restore_result" | "resume_queued_run";
export type RecoveryUiError =
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "case_changed"
  | "invalid";
export type RecoveryCaseKind = "operation" | "evidence" | "run" | "result" | "check";
export type RecoveryCase = {
  token: string;
  version: string;
  kind: RecoveryCaseKind;
  provider: string;
  feature: string;
  project: string | null;
  connection: string | null;
  createdAt: string;
  historical: boolean;
  funding: "byok" | "platform" | "unknown";
  send: "not_started" | "possibly_sent" | "accepted" | "unknown";
  work: "completed" | "unfinished" | "obsolete" | "unknown";
  accounting: "unknown" | "measured" | "not_applicable";
  unknownDimensions: string[];
  proofAvailable: boolean;
  spendingBlocked?: { project: boolean; connection: boolean };
  originalAuthorization?: { maxCostCents: string; targets: number; maxAttempts: number } | null;
  failure: {
    code: RecoveryErrorCode;
    attempts: number;
    firstFailedAt: string;
    failedAt: string;
  } | null;
  triage: {
    status: TriageStatus;
    version: number;
    reason: string | null;
    snoozedUntil: string | null;
    assignedToMe: boolean;
  };
  action: RecoveryAction | null;
  blockedReason:
    | "proof_missing"
    | "wallet_coordination_required"
    | "request_not_linked"
    | "authorization_required"
    | "already_claimed"
    | "project_unavailable"
    | "result_expired"
    | "result_context_changed"
    | null;
};
export type RecoverySummary = {
  unconfirmed: number;
  overdue: number;
  historical: number;
  failed: number;
  unfinished: number;
  retainedResults: number;
  blockedScopes?: { projects: number; connections: number };
  lastActivityAt: string | null;
  lastCompletedAt: string | null;
  lastCleanAt: string | null;
  lastResultActivityAt?: string | null;
};
export type RecoveryFilters = {
  category?: "all" | "unfinished" | "accounting" | "failed" | "historical";
  provider?: string;
  cursor?: string;
};
export type RecoveryPage = {
  instance: string;
  namespace: string;
  asOf: string;
  summary: RecoverySummary;
  rows: RecoveryCase[];
  nextCursor: string | null;
};
export type RecoveryPreview = {
  token: string;
  expiresAt: string;
  eligible: { caseToken: string; action: RecoveryAction }[];
  excluded: { caseToken: string; reason: string }[];
  newPaidAttempts: 0;
  providerCalls: 0;
  originalRuns: number;
  originalExposure?: {
    caseToken: string;
    project: string | null;
    funding: RecoveryCase["funding"];
    maxCostCents: string;
    targets: number;
    maxAttempts: number;
  }[];
};
export type RecoveryOutcome = {
  caseToken: string;
  status: "recovered" | "unchanged" | "skipped" | "failed" | "queued";
  code: string | null;
};
export type RecoveryCommandResult = {
  commandId: string;
  state: "queued" | "running" | "completed" | "failed";
  outcomes: RecoveryOutcome[];
};
