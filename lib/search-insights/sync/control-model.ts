import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsConnectionStatus } from "@/lib/search-insights/connection-state";

export type SearchBackfillKind =
  | "needs_reauth"
  | "paused_user"
  | "waiting_for_first_data"
  | "waiting_worker"
  | "quota"
  | "error"
  | "done"
  | "running"
  | "queued"
  | "starting";
export type SearchSyncControlAction = "pause" | "reconnect" | "resume" | "retry" | null;

export type SearchBackfillFacts = {
  completedDays: number;
  connectionStatus: SearchInsightsConnectionStatus;
  deploymentMode: "cloud" | "self-host";
  firstViewReady: boolean;
  lastActivityAt?: string | null;
  pauseStartedAt?: string | null;
  pausedReason?: string | null;
  safeError?: string | null;
  state?: string | null;
  waiting?: boolean;
  workerStatus: WorkerTemporalStatus;
};

export type SearchBackfillPresentation = {
  action: SearchSyncControlAction;
  actionLabel: string | null;
  description: string;
  kind: SearchBackfillKind;
  polling: boolean;
  supportingText: string | null;
  title: string;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function completedDescription(days: number) {
  return `${days} of 28 finalized days are imported.`;
}

function workerEvidence(status: WorkerTemporalStatus) {
  const liveness = typeof status === "string" ? status : status.status;
  const identity = typeof status === "string" ? null : status.temporalIdentityComparison;
  return liveness === "stale" || identity?.status === "mismatch";
}

function presentation(
  facts: SearchBackfillFacts,
  values: Omit<SearchBackfillPresentation, "description">,
): SearchBackfillPresentation {
  return { description: completedDescription(facts.completedDays), ...values };
}

/**
 * Precedence is connection reauth, user pause, worker evidence, quota, error, done,
 * then explicit durable running/queued state. Progress and default settings never imply running.
 */
export function resolveSearchBackfillPresentation(
  facts: SearchBackfillFacts,
): SearchBackfillPresentation {
  if (facts.connectionStatus === "needs_reauth" || facts.pausedReason === "needs_reauth") {
    return presentation(facts, {
      action: "reconnect",
      actionLabel: "Reconnect Search Console",
      kind: "needs_reauth",
      polling: false,
      supportingText: "Reconnect to continue importing finalized days.",
      title: "Reconnect Search Console",
    });
  }
  if (facts.pausedReason === "user") {
    const pausedOn = dateLabel(facts.pauseStartedAt);
    return presentation(facts, {
      action: "resume",
      actionLabel: "Resume sync",
      kind: "paused_user",
      polling: false,
      supportingText: pausedOn
        ? `Paused on ${pausedOn}. New finalized days will not be imported until you resume sync.`
        : "New finalized days will not be imported until you resume sync.",
      title: "Backfill paused",
    });
  }
  if (workerEvidence(facts.workerStatus)) {
    const selfHosted = facts.deploymentMode === "self-host";
    const comparison =
      typeof facts.workerStatus === "string" ? null : facts.workerStatus.temporalIdentityComparison;
    return presentation(facts, {
      action: null,
      actionLabel: null,
      kind: "waiting_worker",
      polling: false,
      supportingText: selfHosted
        ? comparison?.status === "mismatch"
          ? `The app and background worker use different Temporal settings. ${comparison.detail}`
          : "The background worker is not responding. Restart it, then check its Temporal connection."
        : "Background processing is delayed. Imported days are safe while service recovers.",
      title: selfHosted ? "Backfill waiting for the worker" : "Backfill delayed",
    });
  }
  if (facts.pausedReason === "rate_limited") {
    return presentation(facts, {
      action: null,
      actionLabel: null,
      kind: "quota",
      polling: false,
      supportingText:
        "The provider limit resets automatically, then the backfill resumes automatically.",
      title: "Backfill paused by provider limits",
    });
  }
  if (facts.state === "failed" || facts.pausedReason === "error") {
    const reason = facts.safeError?.trim();
    return presentation(facts, {
      action: "retry",
      actionLabel: "Retry",
      kind: "error",
      polling: false,
      supportingText: reason || "The last import attempt failed. Retry to continue.",
      title: "Backfill needs attention",
    });
  }
  if (facts.state === "waiting_for_first_data") {
    return {
      action: null,
      actionLabel: null,
      description:
        "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.",
      kind: "waiting_for_first_data",
      polling: false,
      supportingText: null,
      title: "Waiting for search data",
    };
  }
  if (facts.firstViewReady || facts.state === "completed") {
    return presentation(facts, {
      action: null,
      actionLabel: null,
      kind: "done",
      polling: false,
      supportingText: null,
      title: "Backfill complete",
    });
  }
  if (facts.state === "running" && !facts.waiting) {
    return presentation(facts, {
      action: "pause",
      actionLabel: "Pause",
      kind: "running",
      polling: true,
      supportingText: "Finalized days are being imported now.",
      title: "Backfill in progress",
    });
  }
  if (facts.state === "queued") {
    return presentation(facts, {
      action: null,
      actionLabel: null,
      kind: "queued",
      polling: true,
      supportingText:
        "The backfill is queued and will begin when processing capacity is available.",
      title: "Backfill queued",
    });
  }
  return presentation(facts, {
    action: null,
    actionLabel: null,
    kind: "starting",
    polling: false,
    supportingText: facts.waiting
      ? "No recent import activity is confirmed. Check again shortly."
      : "Waiting for confirmed import activity.",
    title: facts.waiting ? "Backfill delayed" : "Backfill starting",
  });
}

export type SearchSyncSemanticState =
  | "running"
  | "paused_user"
  | "needs_reauth"
  | "quota"
  | "error"
  | "not_connected"
  | "property_required";
export type SearchSyncControlFacts = {
  connectionStatus?: SearchInsightsConnectionStatus;
  lastActivityAt?: string | null;
  pauseStartedAt?: string | null;
  pausedReason?: string | null;
  safeError?: string | null;
  state?: string | null;
};
export type SearchSyncControlModel = {
  action: SearchSyncControlAction;
  actionLabel: string | null;
  semanticState: SearchSyncSemanticState;
  status: string;
  supportingText: string | null;
};

export function resolveSearchSyncControl(facts: SearchSyncControlFacts): SearchSyncControlModel {
  if (facts.connectionStatus === "not_connected")
    return {
      action: "reconnect",
      actionLabel: "Connect Search Console",
      semanticState: "not_connected",
      status: "Search Console not connected",
      supportingText: "Connect Search Console to start importing search data.",
    };
  if (facts.connectionStatus === "connected_no_property")
    return {
      action: "reconnect",
      actionLabel: "Choose property",
      semanticState: "property_required",
      status: "Search Console property not selected",
      supportingText: "Choose a Search Console property to start importing search data.",
    };
  const model = resolveSearchBackfillPresentation({
    completedDays: 0,
    connectionStatus: facts.connectionStatus ?? "connected",
    deploymentMode: "cloud",
    firstViewReady: false,
    state: facts.state,
    pausedReason: facts.pausedReason,
    pauseStartedAt: facts.pauseStartedAt,
    safeError: facts.safeError,
    workerStatus: "ok",
  });
  return {
    action: model.action,
    actionLabel: model.actionLabel,
    semanticState:
      model.kind === "queued" ||
      model.kind === "starting" ||
      model.kind === "done" ||
      model.kind === "waiting_worker" ||
      model.kind === "waiting_for_first_data"
        ? "running"
        : model.kind,
    status: model.title,
    supportingText: model.supportingText,
  };
}
