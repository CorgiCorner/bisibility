import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import type { Operation } from "@usagekit/core";

export type LocalFinancialState = Operation["state"] | "unavailable" | null;
export type LocalResolutionState =
  | "awaiting_dispatch"
  | "cancelled"
  | "needs_provider_evidence"
  | "pending_reconciliation"
  | "accounting_pending"
  | "awaiting_collection"
  | "owner_release_pending"
  | "complete"
  | "unavailable";
export function projectLocalHostItem(
  record: SubmissionRecord,
  financialState: LocalFinancialState,
  ownerRetained: boolean,
) {
  let resolution: LocalResolutionState;
  if (record.pendingReconciliationReason) resolution = "pending_reconciliation";
  else if (financialState === "unavailable") resolution = "unavailable";
  else if (record.status === "claimed") resolution = "awaiting_dispatch";
  else if (record.status === "cancelled")
    resolution =
      financialState === "released" || financialState === "settled"
        ? ownerRetained
          ? "owner_release_pending"
          : "cancelled"
        : "accounting_pending";
  else if (record.status === "unknown_acceptance") resolution = "needs_provider_evidence";
  else if (!record.settlementRecorded || financialState !== "settled")
    resolution = "accounting_pending";
  else if (record.status === "accepted" && !record.collectedEvidenceId)
    resolution = "awaiting_collection";
  else resolution = ownerRetained ? "owner_release_pending" : "complete";
  return {
    status: record.status,
    version: record.version,
    acceptance: record.outcome?.acceptance ?? null,
    knownAcceptedTaskCount: record.outcome?.taskIds.length ?? null,
    collected: record.collectedEvidenceId !== null,
    cancellationRequested: record.cancellationRequested,
    financialState,
    ownerRetained,
    resolution,
    accountingPending:
      financialState === "unavailable"
        ? null
        : record.status === "cancelled" &&
            (financialState === "released" || financialState === "settled")
          ? false
          : record.attemptId !== null &&
            (!record.settlementRecorded || financialState !== "settled"),
    reconciliationReason:
      record.pendingReconciliationReason ??
      (record.status === "unknown_acceptance" ? "original_acceptance_unresolved" : null),
  };
}
