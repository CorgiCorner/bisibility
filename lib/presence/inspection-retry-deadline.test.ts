import { afterEach, expect, it, vi } from "vitest";
import { createInspectionRetry, InspectionRunDeadlineError } from "./inspection-retry";

afterEach(() => vi.useRealTimers());

it("aborts an in-flight attempt at the shared deadline without retrying an uncertain send", async () => {
  vi.useFakeTimers();
  let release = () => {};
  let signal: AbortSignal | undefined;
  let settled = false;
  const inspect = vi.fn((inputSignal?: AbortSignal) => {
    signal = inputSignal;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const retry = createInspectionRetry({ runDeadline: Date.now() + 100 });
  const result = retry(inspect).then(
    () => {
      settled = true;
      return null;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  try {
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(true);
    expect(await result).toBeInstanceOf(InspectionRunDeadlineError);
    expect(signal?.aborted).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await result;
  }
});
