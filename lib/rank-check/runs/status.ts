import {
  type ItemStatus,
  type RunCounts,
  type RunOutcome,
  type RunStatus,
  SEND_UNCONFIRMED_REASON,
  TERMINAL_ITEM_STATUSES,
  TERMINAL_RUN_STATUSES,
} from "./contract";

const terminalRunStatuses = new Set<RunStatus>(TERMINAL_RUN_STATUSES);
const terminalItemStatuses = new Set<ItemStatus>(TERMINAL_ITEM_STATUSES);

export function outcomeFromCounts(counts: RunCounts): RunOutcome | "cancelled" {
  // An empty run is deferred because nothing ran.
  if (counts.total === 0) return "deferred";

  if (counts.cancelled > 0) return counts.completed > 0 ? "partial" : "cancelled";
  if (counts.completed > 0 && counts.completed < counts.total) return "partial";
  if (counts.completed === counts.total) return "succeeded";
  if (counts.failed > 0 || counts.skipped > 0) return "failed";

  return "deferred";
}

export function isTerminalRunStatus(status: RunStatus) {
  return terminalRunStatuses.has(status);
}

export function isTerminalItemStatus(status: ItemStatus) {
  return terminalItemStatuses.has(status);
}

export const runStatusLabel: Record<RunStatus, string> = {
  planned: "Planned",
  blocked: "Blocked",
  queued: "Queued",
  running: "Running",
  cancelling: "Cancelling",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const runOutcomeLabel: Record<RunOutcome, string> = {
  succeeded: "Succeeded",
  partial: "Partial",
  failed: "Failed",
  deferred: "Deferred",
};

const runItemStatusLabel: Record<ItemStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  deferred: "Deferred",
  cancelled: "Cancelled",
  skipped: "Skipped",
  blocked: "Blocked",
};

export const sendUnconfirmedItemCopy = {
  detail:
    "We could not confirm this check was sent, so it was not retried. Run it again if you need it.",
  label: "Not confirmed",
} as const;

export function runItemStatusCopy(status: ItemStatus, blockedReason: string | null) {
  if (status === "blocked" && blockedReason === SEND_UNCONFIRMED_REASON) {
    return sendUnconfirmedItemCopy;
  }
  return { detail: null, label: runItemStatusLabel[status] };
}
