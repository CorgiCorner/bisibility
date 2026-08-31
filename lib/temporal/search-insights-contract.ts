// Shared vocabulary between the ingestion workflows and their activities. Kept free of
// runtime dependencies so the workflow sandbox can import the failure constants.

/** Provider quota is exhausted: the workflow waits and retries, it never fails. */
export const SEARCH_INSIGHTS_RATE_LIMITED_FAILURE = "search_insights_rate_limited";
/** The stored authorization no longer works: only a reconnect can resume the import. */
export const SEARCH_INSIGHTS_NEEDS_REAUTH_FAILURE = "search_insights_needs_reauth";

export type SearchInsightsImportRef = {
  projectId: string;
  property: string;
  /** Optional while executions started before source-aware imports remain open. */
  source?: "ga4" | "gsc";
};

export type SearchInsightsBackfillActivityInput = SearchInsightsImportRef & {
  batchSize?: number;
};

export type SearchInsightsBackfillBatchResult = {
  /** The batch could not run: no authorization, or the provider has finalized no day yet. */
  blocked: boolean;
  daysProcessed: number;
  importId: string | null;
  done: boolean;
  nextCursor: string | null;
  requestSets: number;
  batchElapsedMs: number;
  waitingForFirstData?: boolean;
};

export type SearchInsightsBackfillWorkflowInput = SearchInsightsImportRef & {
  batchSize?: number;
  batches?: number;
  days?: number;
  pausedMinutes?: number;
  /** Frozen before workflow start so replay never reads mutable project settings. */
  requestSetsPerHour?: number;
  retentionMonths?: 3 | 6 | 12 | 16;
};

export type SearchInsightsBackfillWorkflowResult = {
  days: number;
  status: "completed" | "failed" | "paused" | "waiting_for_first_data";
};

export type SearchInsightsSyncWorkflowInput = {
  projectId?: string;
};
