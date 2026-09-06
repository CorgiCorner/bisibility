import { type DateFormat, formatDate } from "@/lib/dates/format";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsConnectionStatus } from "@/lib/search-insights/connection-state";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";

export const SEARCH_SYNC_STATUS_VOCABULARY = [
  "Running",
  "Paused by you",
  "Paused by provider limits",
  "Waiting for first data",
  "Waiting on worker",
  "Needs reauth",
  "Needs retry",
  "Queued",
  "Complete",
] as const;

export type SearchSyncStatusTitle = (typeof SEARCH_SYNC_STATUS_VOCABULARY)[number];
export type SearchBackfillKind =
  | "complete"
  | "needs_reauth"
  | "needs_retry"
  | "paused_provider"
  | "paused_user"
  | "queued"
  | "running"
  | "waiting_for_first_data"
  | "waiting_worker";
export type SearchSyncControlAction = "pause" | "reconnect" | "resume" | "retry" | null;
export type SearchSyncQueueReason = "no_worker" | "behind_import" | "worker_pickup" | null;
export type SearchImportRuntimeFacts = {
  workerStatus: WorkerTemporalStatus;
};
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

function description(facts: SearchBackfillFacts) {
  const observability = facts.observability;
  return observability
    ? `${observability.qualifyingDays} of ${observability.targetDays} finalized days are imported.`
    : "Finalized import coverage is not available.";
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

function retry(facts: SearchBackfillFacts, supportingText: string) {
  return status(facts, "needs_retry", "Needs retry", supportingText, {
    action: "retry",
    actionLabel: "Retry",
  });
}

function workerUnavailable(worker: ReturnType<typeof workerFacts>) {
  return worker.liveness !== "ok" || worker.identity !== "match";
}

function queued(facts: SearchBackfillFacts): SearchBackfillPresentation {
  const worker = workerFacts(facts.runtime?.workerStatus);
  const property = facts.queue?.blockingPropertyLabel?.trim();
  const reason = workerUnavailable(worker)
    ? "no_worker"
    : property
      ? "behind_import"
      : "worker_pickup";
  if (reason === "no_worker")
    return status(
      facts,
      "waiting_worker",
      "Waiting on worker",
      "Import is waiting for the background worker - restart it and it resumes.",
      { queueReason: reason },
    );
  return status(
    facts,
    "queued",
    "Queued",
    reason === "behind_import"
      ? `Queued behind ${property}. That import is using the shared property quota.`
      : "Queued for worker pickup. The worker checks pending work every few seconds.",
    { polling: true, queueReason: reason },
  );
}

/** Resolves supplied selector, runtime, and queue facts without querying external state. */
export function resolveSearchBackfillPresentation(
  facts: SearchBackfillFacts,
  dateFormat: DateFormat = "month_first",
): SearchBackfillPresentation {
  const connectionMissing =
    facts.connectionStatus === "needs_reauth" ||
    facts.connectionStatus === "not_connected" ||
    facts.connectionStatus === "connected_no_property" ||
    facts.pausedReason === "needs_reauth";
  if (connectionMissing) {
    const chooseProperty = facts.connectionStatus === "connected_no_property";
    const connectFirst = facts.connectionStatus === "not_connected";
    return status(
      facts,
      "needs_reauth",
      "Needs reauth",
      "Connect Search Console to import finalized search data.",
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
  if (facts.pausedReason === "user") {
    const pausedOn = dateLabel(facts.pauseStartedAt, dateFormat);
    return status(
      facts,
      "paused_user",
      "Paused by you",
      pausedOn
        ? `Paused on ${pausedOn}. New finalized days will not be imported until you resume sync.`
        : "New finalized days will not be imported until you resume sync.",
      { action: "resume", actionLabel: "Resume sync" },
    );
  }
  if (facts.pausedReason === "rate_limited")
    return status(
      facts,
      "paused_provider",
      "Paused by provider limits",
      "The provider limit resets automatically, then the import resumes automatically.",
    );
  if (facts.state === "waiting_for_first_data")
    return status(
      facts,
      "waiting_for_first_data",
      "Waiting for first data",
      "Google has not reported any search data for this property yet. We check daily and import automatically when it appears.",
    );

  if (facts.state === "queued") return queued(facts);

  const worker = workerFacts(facts.runtime?.workerStatus);
  if (facts.state === "running" && workerUnavailable(worker))
    return status(
      facts,
      "waiting_worker",
      "Waiting on worker",
      "Import is waiting for the background worker - restart it and it resumes.",
      { queueReason: "no_worker" },
    );
  if (facts.state === "running") {
    const silenceMs = facts.observability?.stall.silenceMs;
    const thresholdMs = facts.observability?.stall.thresholdMs;
    // The silence IS the evidence that nothing is executing: no request-usage row has been
    // written for longer than the threshold, while our own row says the import is running and a
    // matching worker is alive. A Temporal describe used to gate this too, but the web process
    // cannot reach Temporal in production, so that conjunct was permanently false and this
    // detector never fired.
    const stalled =
      worker.liveness === "ok" &&
      worker.identity === "match" &&
      silenceMs !== undefined &&
      thresholdMs !== undefined &&
      silenceMs > thresholdMs;
    if (stalled) return retry(facts, `No import activity for about ${durationLabel(silenceMs)}.`);
    const nextRequestInMs = facts.observability?.stall.nextRequestInMs;
    return status(
      facts,
      "running",
      "Running",
      typeof nextRequestInMs === "number"
        ? `Next request in about ${durationLabel(nextRequestInMs)}.`
        : "Import is running.",
      { action: "pause", actionLabel: "Pause", polling: true },
    );
  }
  if (facts.state === "completed") return status(facts, "complete", "Complete", null);

  if (facts.state === "failed" || facts.pausedReason === "error")
    return retry(
      facts,
      facts.safeError?.trim() || "The last import attempt failed. Retry to continue.",
    );
  // Two branches used to sit here keyed on what Temporal said the workflow was doing. Our own
  // import row is authoritative for our own import, and the web process cannot ask Temporal
  // anyway, so a row that is neither running, completed nor failed is genuinely unknown.
  return retry(facts, "Import status is unavailable. Retry to continue.");
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
export type SearchSyncControlFacts = Omit<SearchBackfillFacts, "connectionStatus"> & {
  connectionStatus?: SearchInsightsConnectionStatus;
};
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
