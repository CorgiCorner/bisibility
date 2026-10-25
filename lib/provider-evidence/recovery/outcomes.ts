export type Retry = { retryable: boolean; suggestedBackoffMs: number | null };
export type UnknownEvidence = { acceptance: "unknown"; costCents: null };
export type LookupReason =
  | "free_history_not_evaluated"
  | "live_result_retrieval_not_evaluated"
  | "invalid_original_utc_window"
  | "provider_metadata_retention_expired"
  | "invalid_original_submission_time"
  | "provider_result_retention_expired"
  | "shared_account_limit"
  | "id_list_account_limit"
  | "missing_original_account_binding"
  | "provider_http_limit"
  | "provider_http_outage"
  | "provider_http_error"
  | "provider_lookup_status"
  | "history_transport_unavailable"
  | "invalid_pagination"
  | "unusable_id_list_response"
  | "invalid_id_list_row"
  | "id_list_pagination_exhausted"
  | "invalid_native_task_id"
  | "native_task_id_conflict";

export type LookupFailure = UnknownEvidence &
  Retry & {
    kind: "rate_limited" | "outage" | "operator_review" | "finally_unknown";
    reason: LookupReason;
  };

export function lookupFailure(
  kind: LookupFailure["kind"],
  reason: LookupReason,
  suggestedBackoffMs: number | null = null,
): LookupFailure {
  return {
    acceptance: "unknown",
    costCents: null,
    kind,
    reason,
    retryable: kind === "rate_limited" || kind === "outage",
    suggestedBackoffMs,
  };
}
