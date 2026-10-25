import {
  InspectionDeadlineError as InspectionRunDeadlineError,
  withInspectionDeadline,
} from "@/lib/providers/analytics/inspection-deadline";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";

export { InspectionRunDeadlineError };

type InspectionRunBudget = { remainingWaitMs: number };

export type InspectionRetryOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  clock?: () => number;
  runBudget?: InspectionRunBudget;
  runDeadline?: number;
  dailyExhaustions?: Map<string, Date>;
};

const MAX_WAIT_MS = 120_000;
const MAX_WAITS = 4;
const MAX_UNKNOWN_WAITS = 3;
// All projects share a 20-minute deadline for discovery, requests, storage and these waits.
const MAX_RUN_WAIT_MS = 600_000;

export function createInspectionRunBudget(): InspectionRunBudget {
  return { remainingWaitMs: MAX_RUN_WAIT_MS };
}

/** One retry budget shared by every selected URL in a project run. */
export function createInspectionRetry(options: InspectionRetryOptions = {}) {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = options.clock ?? Date.now;
  const runBudget = options.runBudget;
  let waitedMs = 0;
  let waits = 0;
  let unknownWaits = 0;

  return async function retry<T>(inspect: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    for (;;) {
      if (options.runDeadline !== undefined && clock() >= options.runDeadline)
        throw new InspectionRunDeadlineError("Shared inspection run deadline reached.");
      try {
        return await (options.runDeadline === undefined
          ? inspect()
          : withInspectionDeadline(inspect, options.runDeadline - clock()));
      } catch (error) {
        // Local limiter rejections retain their immediate deferral behavior.
        if (
          !(error instanceof ProviderRateLimitedError) ||
          error.source !== "provider" ||
          error.scope === "daily"
        ) {
          throw error;
        }
        const unknown = error.scope === "unknown";
        const fallback = unknown
          ? Math.max(5_000, error.retryAfterMs ?? 0) * 2 ** unknownWaits
          : (error.retryAfterMs ?? 60_000);
        const delay = Math.max(fallback, error.resetAt - clock(), 1);
        // Do not shorten a provider delay to fit the budget: defer instead.
        if (
          waits >= MAX_WAITS ||
          (unknown && unknownWaits >= MAX_UNKNOWN_WAITS) ||
          delay > MAX_WAIT_MS - waitedMs ||
          (options.runDeadline !== undefined && clock() + delay >= options.runDeadline) ||
          (runBudget && delay > runBudget.remainingWaitMs)
        ) {
          throw error;
        }
        waits += 1;
        if (unknown) unknownWaits += 1;
        waitedMs += delay;
        if (runBudget) runBudget.remainingWaitMs -= delay;
        await sleep(delay);
      }
    }
  };
}
