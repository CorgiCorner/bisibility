/**
 * Reason codes for rank-check work that was queued while runnable and stopped being runnable
 * before it started. Kept free of imports so presentation code can name them without pulling
 * the database client into a client bundle.
 */
export const KEYWORD_ARCHIVED_REASON = "keyword_archived";
export const MARKET_INACTIVE_REASON = "market_inactive";

export type UnrunnableReason = typeof KEYWORD_ARCHIVED_REASON | typeof MARKET_INACTIVE_REASON;

const UNRUNNABLE_REASONS: readonly string[] = [KEYWORD_ARCHIVED_REASON, MARKET_INACTIVE_REASON];

/**
 * True for a persisted `blockedReason` that names work stopped by the runnable predicate. These
 * codes reach the reader on cancelled items as well as blocked ones, so presentation code must
 * recognize them before it branches on status.
 */
export function isUnrunnableReason(value: string | null | undefined): value is UnrunnableReason {
  return typeof value === "string" && UNRUNNABLE_REASONS.includes(value);
}
