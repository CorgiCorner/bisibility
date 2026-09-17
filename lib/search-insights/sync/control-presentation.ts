import { type DateFormat, formatDate } from "@/lib/dates/format";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type {
  SearchBackfillFacts,
  SearchBackfillKind,
  SearchBackfillPresentation,
  SearchImportCoverage,
  SearchSyncStatusTitle,
  SearchSyncSupportingTextFact,
} from "./control-types";

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
  Pick<
    SearchBackfillPresentation,
    "action" | "actionLabel" | "actionLabelKey" | "polling" | "queueReason"
  >
>;

function status(
  facts: SearchBackfillFacts,
  kind: SearchBackfillKind,
  title: SearchSyncStatusTitle,
  supportingText: string | null,
  supportingTextFact: SearchSyncSupportingTextFact,
  options: StatusOptions = {},
): SearchBackfillPresentation {
  return {
    action: options.action ?? null,
    actionLabel: options.actionLabel ?? null,
    actionLabelKey: options.actionLabelKey ?? null,
    description: description(facts),
    kind,
    polling: options.polling ?? false,
    queueReason: options.queueReason ?? null,
    supportingText,
    supportingTextFact,
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
    { kind: "connection_required" },
    {
      action: "reconnect",
      actionLabel: chooseProperty
        ? "Choose property"
        : connectFirst
          ? "Connect Search Console"
          : "Reconnect Search Console",
      actionLabelKey: chooseProperty ? "choose_property" : connectFirst ? "connect" : "reconnect",
    },
  );
}

function failed(facts: SearchBackfillFacts) {
  return status(
    facts,
    "needs_retry",
    "Failed",
    facts.safeError?.trim() || "The last import attempt failed.",
    { kind: "failed", safeError: facts.safeError?.trim() || null },
    { action: "retry", actionLabel: "Retry", actionLabelKey: "retry" },
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
      { kind: "worker_unavailable" },
      { queueReason: "no_worker" },
    );
  }
  if (worker.liveness !== "ok" || worker.identity !== "match") {
    return status(
      facts,
      "status_unavailable",
      "Status unavailable",
      "Current runtime facts are unavailable. Refresh to check again.",
      { kind: "runtime_unavailable" },
    );
  }
  const coverage = selectSearchImportCoverage(facts);
  const nextRequestInMs = facts.observability?.stall.nextRequestInMs;
  const isNextRequest =
    typeof nextRequestInMs === "number" && Number.isFinite(nextRequestInMs) && nextRequestInMs > 0;
  const allImported = coverage.total !== null && coverage.completed === coverage.total;
  const supportingText = allImported
    ? "All planned days are imported. Import is still running."
    : isNextRequest
      ? `Next request in about ${durationLabel(nextRequestInMs)}.`
      : "Import is running.";
  const supportingTextFact = allImported
    ? ({ kind: "all_imported_running" } as const)
    : isNextRequest
      ? ({ kind: "next_request", milliseconds: nextRequestInMs } as const)
      : ({ kind: "import_running" } as const);
  return status(facts, "running", "Importing", supportingText, supportingTextFact, {
    action: "pause",
    actionLabel: "Pause",
    actionLabelKey: "pause",
    polling: true,
  });
}

/** Resolves supplied durable, coverage, and runtime facts without querying external state. */
export function resolveSearchBackfillPresentation(
  facts: SearchBackfillFacts,
  dateFormat: DateFormat = "month_first",
): SearchBackfillPresentation {
  if (facts.state === "completed") return status(facts, "complete", "Completed", null, null);
  if (facts.state === "failed" || facts.pausedReason === "error") return failed(facts);
  if (facts.pausedReason === "user") {
    const pausedOn = dateLabel(facts.pauseStartedAt, dateFormat);
    return status(
      facts,
      "paused_user",
      "Paused",
      pausedOn ? `Paused on ${pausedOn}.` : "Resume when you are ready to continue importing.",
      { kind: "paused_user", pausedAt: facts.pauseStartedAt ?? null },
      { action: "resume", actionLabel: "Resume", actionLabelKey: "resume" },
    );
  }
  if (facts.pausedReason === "rate_limited") {
    return status(
      facts,
      "paused_provider",
      "Waiting for Google",
      "Google will resume the import automatically when its limit allows.",
      { kind: "paused_provider" },
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
      { kind: "waiting_for_data" },
    );
  }
  if (facts.state === "queued") {
    return status(
      facts,
      "queued",
      "Queued",
      "Import is queued.",
      { kind: "queued" },
      {
        action: "pause",
        actionLabel: "Pause",
        actionLabelKey: "pause",
      },
    );
  }
  if (facts.state === "running") return runningPresentation(facts);
  return status(
    facts,
    "status_unavailable",
    "Status unavailable",
    "Current import facts are unavailable. Refresh to check again.",
    { kind: "runtime_unavailable" },
  );
}
