import { type DateFormat, formatDate } from "@/lib/dates/format";
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
  description: string;
  kind: SearchBackfillKind;
  polling: boolean;
  queueReason: SearchSyncQueueReason;
  supportingText: string | null;
  title: SearchSyncStatusTitle;
};
function finiteNonNegative(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** Full-plan coverage uses persisted day partitions, independently of 28-day readiness. */
export function selectSearchImportCoverage(facts: SearchBackfillFacts): SearchImportCoverage {
  const qualifying = finiteNonNegative(facts.observability?.importCoverage?.completed);
  const target = finiteNonNegative(facts.observability?.importCoverage?.total);
  if (target === null || target === 0) return { completed: qualifying, total: null, unit: "days" };
  return {
    completed: qualifying === null ? null : Math.min(qualifying, target),
    total: target,
    unit: "days",
  };
}
function description(facts: SearchBackfillFacts) {
  const coverage = selectSearchImportCoverage(facts);
  return coverage.completed !== null && coverage.total !== null
    ? `${coverage.completed} of ${coverage.total} finalized days are imported.`
    : "Finalized import coverage is not available.";
}
function dateLabel(value: string | null | undefined, dateFormat: DateFormat) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date.toISOString().slice(0, 10), dateFormat);
}
function durationLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} hr`;
}
function workerFacts(status: WorkerTemporalStatus | undefined) {
  if (!status) return { identity: "unknown", liveness: "unknown" } as const;
  if (typeof status === "string") return { identity: "unknown", liveness: status } as const;
  return { identity: status.temporalIdentityComparison.status, liveness: status.status } as const;
}

type StatusOptions = Partial<
  Pick<SearchBackfillPresentation, "action" | "actionLabel" | "polling" | "queueReason">
>;
function status(
  facts: SearchBackfillFacts,
  kind: SearchBackfillKind,
  title: SearchSyncStatusTitle,
  supportingText: string | null,
  options: StatusOptions = {},
): SearchBackfillPresentation {
  return {
    action: options.action ?? null,
    actionLabel: options.actionLabel ?? null,
    description: description(facts),
    kind,
    polling: options.polling ?? false,
    queueReason: options.queueReason ?? null,
    supportingText,
    title,
  };
}
function connectionPresentation(facts: SearchBackfillFacts) {
  const chooseProperty = facts.connectionStatus === "connected_no_property";
  const connectFirst = facts.connectionStatus === "not_connected";
  return status(
    facts,
    "needs_reauth",
    "Reconnect required",
    "Reconnect Search Console to continue importing.",
    {
      action: "reconnect",
      actionLabel: chooseProperty
        ? "Choose property"
        : connectFirst
          ? "Connect Search Console"
          : "Reconnect Search Console",
    },
  );
}
function failed(facts: SearchBackfillFacts) {
  return status(
    facts,
    "needs_retry",
    "Failed",
    facts.safeError?.trim() || "The last import attempt failed.",
    {
      action: "retry",
      actionLabel: "Retry",
    },
  );
}
function runningPresentation(facts: SearchBackfillFacts) {
  const worker = workerFacts(facts.runtime?.workerStatus);
  if (worker.liveness === "stale" || worker.identity === "mismatch") {
    return status(
      facts,
      "waiting_worker",
      "Delayed",
      "The active worker is unavailable or does not match this import.",
      {
        queueReason: "no_worker",
      },
    );
  }
  if (worker.liveness !== "ok" || worker.identity !== "match") {
    return status(
      facts,
      "status_unavailable",
      "Status unavailable",
      "Current runtime facts are unavailable. Refresh to check again.",
    );
  }
  const coverage = selectSearchImportCoverage(facts);
  const nextRequestInMs = facts.observability?.stall.nextRequestInMs;
  const supportingText =
    coverage.total !== null && coverage.completed === coverage.total
      ? "All planned days are imported. Import is still running."
      : typeof nextRequestInMs === "number" &&
          Number.isFinite(nextRequestInMs) &&
          nextRequestInMs > 0
        ? `Next request in about ${durationLabel(nextRequestInMs)}.`
        : "Import is running.";
  return status(facts, "running", "Importing", supportingText, {
    action: "pause",
    actionLabel: "Pause",
    polling: true,
  });
}

/** Resolves supplied durable, coverage, and runtime facts without querying external state. */
export function resolveSearchBackfillPresentation(
  facts: SearchBackfillFacts,
  dateFormat: DateFormat = "month_first",
): SearchBackfillPresentation {
  if (facts.state === "completed") return status(facts, "complete", "Completed", null);
  if (facts.state === "failed" || facts.pausedReason === "error") return failed(facts);
  if (facts.pausedReason === "user") {
    const pausedOn = dateLabel(facts.pauseStartedAt, dateFormat);
    return status(
      facts,
      "paused_user",
      "Paused",
      pausedOn ? `Paused on ${pausedOn}.` : "Resume when you are ready to continue importing.",
      { action: "resume", actionLabel: "Resume" },
    );
  }
  if (facts.pausedReason === "rate_limited") {
    return status(
      facts,
      "paused_provider",
      "Waiting for Google",
      "Google will resume the import automatically when its limit allows.",
    );
  }
  if (
    facts.connectionStatus === "needs_reauth" ||
    facts.connectionStatus === "not_connected" ||
    facts.connectionStatus === "connected_no_property" ||
    facts.pausedReason === "needs_reauth"
  ) {
    return connectionPresentation(facts);
  }
  if (facts.state === "waiting_for_first_data") {
    return status(
      facts,
      "waiting_for_first_data",
      "Waiting for data",
      "Google has not reported finalized search data for this property yet.",
    );
  }
  if (facts.state === "queued")
    return status(facts, "queued", "Queued", "Import is queued.", {
      action: "pause",
      actionLabel: "Pause",
    });
  if (facts.state === "running") return runningPresentation(facts);
  return status(
    facts,
    "status_unavailable",
    "Status unavailable",
    "Current import facts are unavailable. Refresh to check again.",
  );
}

export type SearchSyncSemanticState =
  | "complete"
  | "error"
  | "needs_reauth"
  | "not_connected"
  | "paused_user"
  | "property_required"
  | "quota"
  | "running";
export type SearchSyncControlFacts = SearchBackfillFacts;
export type SearchSyncControlModel = {
  action: SearchSyncControlAction;
  actionLabel: string | null;
  queueReason: SearchSyncQueueReason;
  semanticState: SearchSyncSemanticState;
  status: SearchSyncStatusTitle;
  supportingText: string | null;
};
function semanticState(facts: SearchSyncControlFacts, model: SearchBackfillPresentation) {
  if (facts.connectionStatus === "not_connected") return "not_connected" as const;
  if (facts.connectionStatus === "connected_no_property") return "property_required" as const;
  if (model.kind === "paused_user") return "paused_user" as const;
  if (model.kind === "paused_provider") return "quota" as const;
  if (model.kind === "needs_reauth") return "needs_reauth" as const;
  if (model.kind === "complete") return "complete" as const;
  return model.kind === "needs_retry" ? "error" : "running";
}

export function resolveSearchSyncControl(
  facts: SearchSyncControlFacts,
  dateFormat: DateFormat = "month_first",
): SearchSyncControlModel {
  const model = resolveSearchBackfillPresentation(facts, dateFormat);
  return {
    action: model.action,
    actionLabel: model.actionLabel,
    queueReason: model.queueReason,
    semanticState: semanticState(facts, model),
    status: model.title,
    supportingText: model.supportingText,
  };
}
