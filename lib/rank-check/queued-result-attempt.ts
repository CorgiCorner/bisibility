import {
  QUEUED_REDIRECT_ACTIVITY_RESERVE_MS,
  QUEUED_REDIRECT_TIMEOUT_MS,
  QUEUED_RESULT_ATTEMPT_BUDGET_MS,
  QUEUED_RESULT_DB_MAX_WAIT_MS,
  QUEUED_RESULT_DB_TRANSACTION_TIMEOUT_MS,
  QUEUED_RESULT_RELEASE_DB_MAX_WAIT_MS,
  QUEUED_RESULT_RELEASE_DB_TRANSACTION_TIMEOUT_MS,
} from "./queued-timeouts";

export const queuedResultTransactionOptions = {
  maxWait: QUEUED_RESULT_DB_MAX_WAIT_MS,
  timeout: QUEUED_RESULT_DB_TRANSACTION_TIMEOUT_MS,
};

export const queuedResultReleaseTransactionOptions = {
  maxWait: QUEUED_RESULT_RELEASE_DB_MAX_WAIT_MS,
  timeout: QUEUED_RESULT_RELEASE_DB_TRANSACTION_TIMEOUT_MS,
};

export type QueuedResultAttemptOptions = {
  /** When the owning activity attempt reaches its start-to-close timeout. */
  activityDeadlineAt?: Date;
  deadlineAt?: Date;
  signal?: AbortSignal;
};

/**
 * The full conversion timeout when it still fits the activity attempt, otherwise null. A timeout
 * is never shortened: a converter timeout counts as an attempt, so our own budget must not cause it.
 */
export function queuedRedirectConversionTimeoutMs(activityDeadlineAt?: Date, now = Date.now()) {
  if (!activityDeadlineAt) return QUEUED_REDIRECT_TIMEOUT_MS;
  const available = activityDeadlineAt.getTime() - now - QUEUED_REDIRECT_ACTIVITY_RESERVE_MS;
  return available >= QUEUED_REDIRECT_TIMEOUT_MS ? QUEUED_REDIRECT_TIMEOUT_MS : null;
}

export class QueuedResultDeadlineReachedError extends Error {
  constructor() {
    super("Queued result deadline reached.");
    this.name = "QueuedResultDeadlineReachedError";
  }
}

export function queuedResultDeadlineReached(deadlineAt?: Date) {
  return deadlineAt !== undefined && Date.now() >= deadlineAt.getTime();
}

export function throwIfQueuedResultDeadlineReached(deadlineAt?: Date) {
  if (queuedResultDeadlineReached(deadlineAt)) throw new QueuedResultDeadlineReachedError();
}

export function queuedResultAttemptSignal(external?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Queued result attempt exceeded its local deadline.")),
    QUEUED_RESULT_ATTEMPT_BUDGET_MS,
  );
  return {
    clear: () => clearTimeout(timeout),
    signal: external ? AbortSignal.any([external, controller.signal]) : controller.signal,
  };
}

export function throwIfQueuedResultAborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new Error("Queued result attempt was cancelled.");
}

export async function runQueuedResultTasksWithinDeadline(
  taskIds: string[],
  options: QueuedResultAttemptOptions,
  persistTask: (taskId: string, options: QueuedResultAttemptOptions) => Promise<unknown>,
) {
  for (const taskId of taskIds) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Queued result activity was cancelled.");
    }
    if (queuedResultDeadlineReached(options.deadlineAt)) return false;
    if ((await persistTask(taskId, options)) === "deadline") return false;
  }
  return true;
}
