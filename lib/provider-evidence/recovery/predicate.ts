import type { ProviderOperationEvidence } from "@/lib/generated/prisma/client";

export type AttemptStopReason =
  | "retries_exhausted"
  | "non_retryable"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled";
export type RecoveryDimensions = Pick<
  ProviderOperationEvidence,
  "acceptance" | "fulfillment" | "accounting"
>;
export type RecoveryStartInput = RecoveryDimensions & {
  operationState: string;
  transportFenced: boolean;
  stopReason: string | null;
  queued: boolean;
  queueDeadlineAt: Date | null;
  pollingStoppedAt: Date | null;
};
const STOP_REASONS: readonly string[] = [
  "retries_exhausted",
  "non_retryable",
  "workflow_completed",
  "workflow_failed",
  "workflow_cancelled",
];
export function recoveryStartDecision(input: RecoveryStartInput, now: Date) {
  if (input.operationState === "released") return "released";
  if (!input.transportFenced) return "unfenced_operator_only";
  const unresolved =
    (input.acceptance !== "accepted" && input.acceptance !== "rejected") ||
    input.fulfillment !== "complete" ||
    input.accounting !== "measured";
  if (!unresolved) return "not_needed";
  if (!input.stopReason || !STOP_REASONS.includes(input.stopReason))
    return "waiting_for_attempt_end";
  if (
    input.queued &&
    (!input.queueDeadlineAt || input.queueDeadlineAt > now || !input.pollingStoppedAt)
  )
    return "waiting_for_queue_deadline";
  return "enqueue";
}

export function recoveryWriteGateOpen(attempt: {
  completionAcknowledgedAt: Date | null;
  ownershipSupersededAt: Date | null;
}) {
  return attempt.completionAcknowledgedAt !== null || attempt.ownershipSupersededAt !== null;
}
