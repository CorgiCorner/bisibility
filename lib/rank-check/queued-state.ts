export const QUEUED_TASK_TRANSITIONS = {
  ambiguous: ["deferred", "provider_failed", "ready"],
  completed: [],
  deferred: [],
  failed: [],
  persisting: ["completed", "deferred", "failed", "ready"],
  prepared: ["deferred", "submitting"],
  provider_failed: ["deferred", "persisting"],
  ready: ["deferred", "persisting"],
  submitted: ["deferred", "provider_failed", "ready"],
  submitting: ["ambiguous", "deferred", "provider_failed", "submitted"],
} as const;

export const QUEUED_BATCH_TRANSITIONS = {
  ambiguous: ["deferred", "ready"],
  completed: [],
  deferred: [],
  failed: [],
  prepared: ["deferred", "submitting"],
  ready: ["completed", "deferred", "failed"],
  submitted: ["completed", "deferred", "failed", "ready"],
  submitting: ["ambiguous", "deferred", "ready", "submitted"],
} as const;

export const ACTIVE_QUEUED_TASK_STATES = Object.entries(QUEUED_TASK_TRANSITIONS)
  .filter(([, next]) => next.length > 0)
  .map(([state]) => state);

export const TERMINAL_QUEUED_TASK_STATES = Object.entries(QUEUED_TASK_TRANSITIONS)
  .filter(([, next]) => next.length === 0)
  .map(([state]) => state);

export const ACTIVE_QUEUED_BATCH_STATES = Object.entries(QUEUED_BATCH_TRANSITIONS)
  .filter(([, next]) => next.length > 0)
  .map(([state]) => state);

export function queuedTaskStateForRankCheck(status: string) {
  return status === "completed" || status === "deferred" || status === "failed" ? status : null;
}
