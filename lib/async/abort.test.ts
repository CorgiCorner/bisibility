import { afterEach, describe, expect, it, vi } from "vitest";
import { awaitWithSignal, withDeadline } from "./abort";

describe("bounded asynchronous waits", () => {
  afterEach(() => vi.useRealTimers());

  it("never starts work for an already-aborted signal", async () => {
    const operation = vi.fn();
    await expect(awaitWithSignal(operation, AbortSignal.abort())).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it("observes a late rejection and removes abort listeners", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let reject: ((error: Error) => void) | undefined;
    const pending = awaitWithSignal(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    reject?.(new Error("late dependency failure"));
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("preserves successful results and clears the deadline timer", async () => {
    vi.useFakeTimers();
    await expect(
      withDeadline(undefined, 10, (signal) => awaitWithSignal(() => 42, signal)),
    ).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an uncooperative dependency at the configured deadline", async () => {
    vi.useFakeTimers();
    const pending = withDeadline(undefined, 10, (signal) =>
      awaitWithSignal(() => new Promise(() => undefined), signal),
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(11);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
