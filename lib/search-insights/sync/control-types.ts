import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsConnectionStatus } from "@/lib/search-insights/connection-state";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";

export const SEARCH_SYNC_STATUS_VOCABULARY = [
  "Queued",
  "Importing",
  "Paused",
  "Waiting for Google",
  "Reconnect required",
  "Waiting for data",
  "Delayed",
  "Failed",
  "Completed",
  "Status unavailable",
] as const;

type LegacyImportStatusTitle =
  | "Complete"
  | "Needs reauth"
  | "Needs retry"
  | "Paused by provider limits"
  | "Paused by you"
  | "Running"
  | "Waiting on worker";

export type SearchSyncStatusTitle =
  | (typeof SEARCH_SYNC_STATUS_VOCABULARY)[number]
  | LegacyImportStatusTitle;
export type SearchBackfillKind =
  | "complete"
  | "needs_reauth"
  | "needs_retry"
  | "paused_provider"
  | "paused_user"
  | "queued"
  | "running"
  | "status_unavailable"
  | "waiting_for_first_data"
  | "waiting_worker";
export type SearchSyncControlAction = "pause" | "reconnect" | "resume" | "retry" | null;
export type SearchSyncQueueReason = "no_worker" | "behind_import" | "worker_pickup" | null;
export type SearchSyncActionLabelKey =
  | "choose_property"
  | "connect"
  | "pause"
  | "reconnect"
  | "resume"
  | "retry"
  | null;
export type SearchSyncSupportingTextFact =
  | { kind: "all_imported_running" }
  | { kind: "connection_required" }
  | { kind: "failed"; safeError: string | null }
  | { kind: "import_running" }
  | { kind: "next_request"; milliseconds: number }
  | { kind: "paused_provider" }
  | { kind: "paused_user"; pausedAt: string | null }
  | { kind: "queued" }
  | { kind: "runtime_unavailable" }
  | { kind: "waiting_for_data" }
  | { kind: "worker_unavailable" }
  | null;
export type SearchImportRuntimeFacts = { workerStatus: WorkerTemporalStatus };
export type SearchImportQueueFacts = { blockingPropertyLabel?: string | null };

export type SearchBackfillFacts = {
  connectionStatus?: SearchInsightsConnectionStatus;
  observability?: ImportObservabilityFacts;
  queue?: SearchImportQueueFacts;
  runtime?: SearchImportRuntimeFacts;
  pauseStartedAt?: string | null;
  pausedReason?: string | null;
  safeError?: string | null;
  state?: string | null;
};
export type SearchImportCoverage = Readonly<{
  completed: number | null;
  total: number | null;
  unit: "days";
}>;
export type SearchBackfillPresentation = {
  action: SearchSyncControlAction;
  actionLabel: string | null;
  actionLabelKey: SearchSyncActionLabelKey;
  description: string;
  kind: SearchBackfillKind;
  polling: boolean;
  queueReason: SearchSyncQueueReason;
  supportingText: string | null;
  supportingTextFact: SearchSyncSupportingTextFact;
  title: SearchSyncStatusTitle;
};
