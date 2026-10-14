export const RECOVERY_ERROR_CODES = [
  "original_operation_missing",
  "native_identity_conflict",
  "native_proof_ambiguous",
  "transport_fence_missing",
  "original_authority_missing",
  "wallet_coordination_required",
  "proof_import_conflict",
  "settlement_refused",
  "transaction_timeout",
  "transaction_conflict",
  "store_unavailable",
  "recovery_failed",
] as const;
export type RecoveryErrorCode = (typeof RECOVERY_ERROR_CODES)[number];

const messages: Record<string, RecoveryErrorCode> = {
  "Original live paid operation is missing": "original_operation_missing",
  "Original accounting operation is unavailable": "original_operation_missing",
  "Original native queued identity conflicts": "native_identity_conflict",
  "Original queued proof is ambiguous": "native_proof_ambiguous",
  "Queued acceptance has no retained transport fence": "transport_fence_missing",
  "Native paid proof requires a transport fence": "transport_fence_missing",
  "Original paid task identity is unavailable or ambiguous": "original_authority_missing",
  "Original paid attempt context is unavailable": "original_authority_missing",
  "Platform recovery requires wallet coordination": "wallet_coordination_required",
  "Retained proof import conflict": "proof_import_conflict",
  "Retained native recovery refused": "settlement_refused",
  "Paid composition refused": "settlement_refused",
};

/** Only a closed code vocabulary leaves the failed transaction. */
export function recoveryErrorCode(error: unknown): RecoveryErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2028") return "transaction_timeout";
    if (["P2034", "40001", "40P01"].includes(String(error.code))) return "transaction_conflict";
    if (["P1001", "P1002", "P1017", "57P01", "08006"].includes(String(error.code)))
      return "store_unavailable";
  }
  return error instanceof Error
    ? (messages[error.message] ?? "recovery_failed")
    : "recovery_failed";
}
