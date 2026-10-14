import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import type { LocalFinancialState } from "@/lib/local-monitoring-host/projection";
import type { MonitorRetryReason } from "./input-schema";

/** Only a server-verified canonical terminal proof permits a new paid occurrence. */
export function monitorRetryEligibility(input: {
  record: SubmissionRecord;
  financialState: LocalFinancialState;
  ownerRetained: boolean;
  nativeProof: "proven_rejected" | "proven_unsent" | null;
}): { eligible: boolean; reason: MonitorRetryReason } {
  const { record, financialState, ownerRetained, nativeProof } = input;
  const knownIds = [
    record.outcome,
    record.originalOutcome,
    ...(record.reconciliationHistory ?? []).map((proof) => proof.outcome),
  ].some((outcome) => (outcome?.taskIds.length ?? 0) > 0);
  if (knownIds || record.status === "accepted")
    return { eligible: false, reason: "accepted_original" };
  if (record.status === "unknown_acceptance" || record.outcome?.acceptance === "unknown")
    return { eligible: false, reason: "unknown_acceptance" };
  if (record.pendingReconciliationReason)
    return { eligible: false, reason: "reconciliation_pending" };
  if (record.status !== "rejected" && record.status !== "cancelled")
    return { eligible: false, reason: "in_progress" };
  if (financialState !== "settled" && financialState !== "released")
    return { eligible: false, reason: "accounting_pending" };
  if (ownerRetained) return { eligible: false, reason: "owner_retained" };
  if (
    record.status === "rejected" &&
    financialState === "settled" &&
    record.settlementRecorded &&
    record.outcome?.acceptance === "rejected" &&
    nativeProof === "proven_rejected"
  )
    return { eligible: true, reason: "eligible_rejected" };
  // A canonical unsent settlement may retain paid_attempts1 with its sole measured-zero receipt.
  if (record.status === "cancelled" && nativeProof === "proven_unsent")
    return { eligible: true, reason: "eligible_unsent" };
  return { eligible: false, reason: "proof_unavailable" };
}
