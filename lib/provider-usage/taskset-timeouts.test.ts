import { expect, it } from "vitest";
import {
  TASKSET_ADMISSION_MAX_ATTEMPTS,
  TASKSET_ADMISSION_RETRY_DELAY_MS,
  TASKSET_SUBMISSION_ACTIVITY_TIMEOUT,
  TASKSET_TRANSACTION_OPTIONS,
} from "./taskset-timeouts";

it("leaves room for both pre-send stages, the one-shot fence, provider I/O and finalization", () => {
  const transaction = TASKSET_TRANSACTION_OPTIONS.maxWait + TASKSET_TRANSACTION_OPTIONS.timeout;
  const backoff =
    TASKSET_ADMISSION_RETRY_DELAY_MS * (2 ** (TASKSET_ADMISSION_MAX_ATTEMPTS - 1) - 1);
  const preSendStage = TASKSET_ADMISSION_MAX_ATTEMPTS * transaction + backoff;
  const postTimeout = 30_000;
  expect(2 * preSendStage + transaction + postTimeout + 45_000).toBeLessThan(6 * 60_000);
  expect(TASKSET_SUBMISSION_ACTIVITY_TIMEOUT).toBe("6 minutes");
  // Native dispatch intent still expires after sixty seconds; the fence is never retried.
  expect(transaction).toBeLessThan(60_000);
});
