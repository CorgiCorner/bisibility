import type { ModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MODEL_READ_ATTEMPTS, useModelPlaygroundRead } from "./useModelPlaygroundRead";

afterEach(() => vi.useRealTimers());
test("polls the pending quote and displays a different canonical run id without launching", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue({
    runId: "canonical",
    columns: [],
    progress: [{ columnId: "column", state: "observed" }],
  });
  const launch = vi.fn();
  const service = { read, launch } as unknown as ModelPlaygroundLaunchService;
  const initial = {
    runId: "quote",
    columns: [],
    progress: [{ columnId: "column", state: "in_flight" }],
  };
  const h = renderHook(() => useModelPlaygroundRead(service, initial));
  expect(h.result.current.pending).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(read).toHaveBeenCalledWith("quote");
  expect(h.result.current.result?.runId).toBe("canonical");
  expect(h.result.current.pending).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(read).toHaveBeenCalledTimes(1);
  expect(launch).not.toHaveBeenCalled();
});

test("a missing read never launches and unmount cancels the subscription", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue(null);
  const launch = vi.fn();
  const service = { read, launch } as unknown as ModelPlaygroundLaunchService;
  const initial = {
    runId: "quote",
    columns: [],
    progress: [{ columnId: "column", state: "admitted" }],
  };
  const h = renderHook(() => useModelPlaygroundRead(service, initial));
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(read).toHaveBeenCalledOnce();
  expect(h.result.current.pending).toBe(true);
  h.unmount();
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(read).toHaveBeenCalledOnce();
  expect(launch).not.toHaveBeenCalled();
});

test.each(["null", "error", "pending", "hung"])(
  "bounds %s reads and releases Run without starting a model",
  async (mode) => {
    vi.useFakeTimers();
    const initial = {
      runId: "bounded",
      columns: [],
      progress: [{ columnId: "column", state: "admitted" }],
    };
    const read =
      mode === "hung"
        ? vi.fn(() => new Promise<null>(() => {}))
        : mode === "error"
          ? vi.fn().mockRejectedValue(new Error("Lost"))
          : vi.fn().mockResolvedValue(mode === "pending" ? initial : null);
    const launch = vi.fn();
    const h = renderHook(() =>
      useModelPlaygroundRead({ read, launch } as unknown as ModelPlaygroundLaunchService, initial),
    );
    expect(h.result.current.pending).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(320_000));
    expect(h.result.current.pending).toBe(false);
    expect(h.result.current.unconfirmed).toBe(true);
    expect(read.mock.calls.length).toBeLessThanOrEqual(MODEL_READ_ATTEMPTS);
    const count = read.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(100_000));
    expect(read).toHaveBeenCalledTimes(count);
    expect(launch).not.toHaveBeenCalled();
  },
);

test("service replacement cannot reset the pending run deadline", async () => {
  vi.useFakeTimers();
  const initial = {
    runId: "stable-run",
    columns: [],
    progress: [{ columnId: "column", state: "admitted" }],
  };
  const read = vi.fn().mockResolvedValue(null);
  const h = renderHook(({ service }) => useModelPlaygroundRead(service, initial), {
    initialProps: { service: { read } as unknown as ModelPlaygroundLaunchService },
  });
  await act(() => vi.advanceTimersByTimeAsync(149000));
  h.rerender({ service: { read } as unknown as ModelPlaygroundLaunchService });
  await act(() => vi.advanceTimersByTimeAsync(160000));
  expect(h.result.current.pending).toBe(false);
  expect(h.result.current.unconfirmed).toBe(true);
  expect(read.mock.calls.length).toBeLessThanOrEqual(MODEL_READ_ATTEMPTS);
});
