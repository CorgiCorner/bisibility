export const QUEUED_COST_MAX_ATTEMPTS = 6;
const ACCOUNT_INCIDENT_RETRY_MS = 60 * 60_000;
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_CAP_MS = 6 * 3_600_000;

/** Operator-facing reasons. `retry` ones are re-attempted; the others stay until an operator acts. */
export const QUEUED_COST_FINAL_REASONS = [
  "provider_task_unavailable",
  "credential_changed",
  "credentials_unavailable",
  "cost_not_reported",
  "provider_unreachable",
] as const;
export const QUEUED_COST_RETRY_REASONS = [
  "account_incident",
  "provider_task_unavailable",
  "cost_not_reported",
  "provider_unreachable",
] as const;
export type QueuedCostReason =
  | (typeof QUEUED_COST_FINAL_REASONS)[number]
  | (typeof QUEUED_COST_RETRY_REASONS)[number];

export type QueuedCostEvidence = {
  v: 1;
  status: "recovered" | "retry" | "unrecoverable";
  reason?: QueuedCostReason;
  attempts: number;
  at: string;
  nextAt?: string;
  source: "task_get";
  providerTaskId: string;
  credentialVersion: string | null;
  statusCode?: number;
  bodyHash?: string;
};

export function queuedCostBackoffMs(attempts: number) {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 3 ** Math.max(0, attempts - 1));
}

export function queuedCostAccountRetryMs() {
  return ACCOUNT_INCIDENT_RETRY_MS;
}

/** A stored value is trusted only in this exact shape; anything else reads as no evidence. */
export function parseQueuedCostEvidence(value: unknown): QueuedCostEvidence | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<QueuedCostEvidence>;
  return v.v === 1 &&
    (v.status === "recovered" || v.status === "retry" || v.status === "unrecoverable") &&
    typeof v.attempts === "number" &&
    typeof v.providerTaskId === "string"
    ? (v as QueuedCostEvidence)
    : null;
}

/**
 * What the operator console shows for a task whose cost is still unknown: `pending` while retries
 * remain, `unrecoverable` once recovery gave up. Unknown reasons never produce a specific state.
 */
export function queuedCostOperatorState(
  value: unknown,
): { state: "pending" | "unrecoverable"; reason: QueuedCostReason } | null {
  const evidence = parseQueuedCostEvidence(value);
  if (!evidence || evidence.status === "recovered") return null;
  const reason = evidence.reason;
  if (
    !reason ||
    !([...QUEUED_COST_FINAL_REASONS, ...QUEUED_COST_RETRY_REASONS] as string[]).includes(reason)
  )
    return null;
  return { state: evidence.status === "retry" ? "pending" : "unrecoverable", reason };
}
