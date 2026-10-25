import type { EvidenceProjection } from "./model";
/** Additive public shape contains no operation, account, credential or payload identity. */
export function evidenceProjectionResource(value: EvidenceProjection | null | undefined) {
  if (!value) return null;
  return {
    acceptance: value.acceptance,
    fulfillment: value.fulfillment,
    returned_depth: value.returnedDepth,
    accounting: value.accounting,
    result: value.result,
    cost: value.cost,
    original_checked_at: value.originalCheckedAt,
    recovery: value.recovery
      ? {
          state: value.recovery.state,
          last_attempt_at: value.recovery.lastAttemptAt,
          next_attempt_at: value.recovery.nextAttemptAt,
          reason: value.recovery.reason,
        }
      : null,
  };
}
