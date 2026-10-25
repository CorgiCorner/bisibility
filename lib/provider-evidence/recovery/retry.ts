import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import type { RecoveryLookup } from "./proof-value";
import { recoveryAdapters } from "./registry";

export const RECOVERY_MAX_LOOKUPS = 5;
export function recoveryRetention(identity: ProviderDispatchIdentity | null, now: Date) {
  if (!identity) return null;
  return recoveryAdapters.get(identity.provider)?.retention(identity, now) ?? null;
}

export function recoveryRetryPlan(input: {
  outcome: RecoveryLookup;
  identity: ProviderDispatchIdentity | null;
  attempts: number;
  accounting: "unknown" | "measured" | "conflict";
  reason: string;
  resultPending: boolean;
  resultComplete: boolean;
  now: Date;
}) {
  const { outcome, identity, attempts, accounting, reason, now } = input;
  const expired = recoveryRetention(identity, now);
  const retryable = "retryable" in outcome && outcome.retryable;
  const disabled = reason === "proof_writes_disabled" || reason === "restore_disabled";
  const operatorOnly =
    accounting === "conflict" ||
    disabled ||
    (outcome.kind === "operator_review" && !retryable) ||
    [
      "already_settled",
      "native_cost_unknown",
      "id_list_cost_unknown",
      "open_hold_insufficient",
      "unheld_or_debt_refused",
      "native_proof_import_refused",
      "original_hosted_attempt_missing",
      "original_hosted_attempt_unavailable",
      "aggregate_price_requires_operator",
      "frozen_price_missing",
      "platform_funding_unavailable",
      "funding_source_unavailable",
      "expired_wallet_lots_require_operator",
    ].includes(reason) ||
    reason.includes("conflict");
  const exhausted =
    accounting === "unknown" &&
    !operatorOnly &&
    (expired?.kind === "finally_unknown" || attempts >= RECOVERY_MAX_LOOKUPS);
  const exhaustionReason = exhausted
    ? (expired?.reason ?? `lookup_attempts_exhausted:${reason}`)
    : null;
  const retry =
    !operatorOnly &&
    !exhausted &&
    attempts < RECOVERY_MAX_LOOKUPS &&
    (retryable || accounting === "unknown" || input.resultPending);
  const suggested = "suggestedBackoffMs" in outcome ? outcome.suggestedBackoffMs : null;
  const backoff = Math.max(60_000 * 2 ** Math.max(0, attempts - 1), suggested ?? 0);
  const deadline =
    identity?.executionMode === "queued" ? identity.createdAt.getTime() + 30 * 86400000 : Infinity;
  const nextAttemptAt = retry ? new Date(Math.min(now.getTime() + backoff, deadline)) : null;
  const state = operatorOnly
    ? "operator_review"
    : retry
      ? "scheduled"
      : accounting === "measured" && input.resultComplete
        ? "resolved"
        : "operator_review";
  return {
    state: state as "scheduled" | "resolved" | "operator_review",
    nextAttemptAt,
    reason: exhaustionReason ?? reason,
    exhaustionStatus: exhausted
      ? ("exhausted" as const)
      : accounting === "measured"
        ? ("not_applicable" as const)
        : ("pending" as const),
    exhaustionReason,
  };
}
