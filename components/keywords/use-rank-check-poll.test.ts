import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/rank-check-status", () => ({ getRankCheckStatus: vi.fn() }));

import { useRankCheckPoll } from "./use-rank-check-poll";

const CHECK_ID = "check_abcdefghijklmnopqrstuvwx";

function runningResult() {
  return {
    errorCode: null,
    error: null,
    finishedAt: null,
    position: null,
    requestedDepth: null,
    status: "running",
  };
}

function completedResult(position = 12, requestedDepth = 100) {
  return {
    errorCode: null,
    error: null,
    finishedAt: "2026-08-21T12:00:00.000Z",
    position,
    requestedDepth,
    status: "completed",
  };
}

function failedResult(errorCode = "provider_billing") {
  return {
    errorCode,
    error: "insufficient funds",
    finishedAt: "2026-08-21T12:00:00.000Z",
    position: null,
    requestedDepth: null,
    status: "failed",
  };
}

function deferredResult() {
  return {
    errorCode: null,
    error: null,
    finishedAt: "2026-08-21T12:00:00.000Z",
    position: null,
    requestedDepth: null,
    status: "deferred",
  };
}

describe("useRankCheckPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first poll occurs after 2 seconds", async () => {
    const pollAction = vi.fn().mockResolvedValue(runningResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    expect(pollAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(pollAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("subsequent polls occur after 5 seconds", async () => {
    const pollAction = vi.fn().mockResolvedValue(runningResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pollAction).toHaveBeenCalledTimes(2);
  });

  it("stops polling and calls onTerminal once on completed", async () => {
    const pollAction = vi.fn().mockResolvedValue(completedResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("stops polling and calls onTerminal once on failed", async () => {
    const pollAction = vi.fn().mockResolvedValue(failedResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("stops polling and calls onTerminal once on deferred", async () => {
    const pollAction = vi.fn().mockResolvedValue(deferredResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith(expect.objectContaining({ status: "deferred" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it("schedules the next 5-second attempt after a poll rejection", async () => {
    const pollAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(runningResult());
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(pollAction).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(pollAction).toHaveBeenCalledTimes(3);
  });

  it("cancels timers when rankCheckId changes", async () => {
    const pollAction = vi.fn().mockResolvedValue(runningResult());
    const onTerminal = vi.fn();

    const { rerender } = renderHook(
      ({ id }: { id: string }) => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: id }),
      { initialProps: { id: CHECK_ID } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    rerender({ id: "check_differentabcdefghijklmnopqr" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(2);
    expect(pollAction).toHaveBeenLastCalledWith({
      rankCheckId: "check_differentabcdefghijklmnopqr",
    });
  });

  it("cancels timers on unmount", async () => {
    const pollAction = vi.fn().mockResolvedValue(runningResult());
    const onTerminal = vi.fn();

    const { unmount } = renderHook(() =>
      useRankCheckPoll({ onTerminal, pollAction, rankCheckId: CHECK_ID }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("does not poll when rankCheckId is null", async () => {
    const pollAction = vi.fn();
    const onTerminal = vi.fn();

    renderHook(() => useRankCheckPoll({ onTerminal, pollAction, rankCheckId: null }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(pollAction).not.toHaveBeenCalled();
  });
});
