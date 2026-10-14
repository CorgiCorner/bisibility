import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";

/** Candidate selection only. This never proves native absence or financial release. */
export function isUnsentLocalProjection(record: SubmissionRecord) {
  return (
    ["claimed", "cancelled", "unknown_acceptance"].includes(record.status) &&
    (record.status !== "claimed" || record.attemptId === null) &&
    record.outcome === null &&
    !record.settlementRecorded &&
    record.collectedEvidenceId === null &&
    !record.originalOutcome &&
    !record.reconciliationHistory?.length &&
    !record.pendingReconciliationReason
  );
}
