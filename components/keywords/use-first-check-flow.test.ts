import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/rank-check-status", () => ({ getRankCheckStatus: vi.fn() }));

import { useFirstCheckFlow } from "./use-first-check-flow";

const KEYWORD_ID = "kw_abcdefghijklmnopqrstuvwx";
const CHECK_ID = "check_abcdefghijklmnopqrstuvwx";

function runningResult() {
  return { rankCheckId: CHECK_ID, status: "running" };
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

function renderFlow(overrides: Partial<Parameters<typeof useFirstCheckFlow>[0]> = {}) {
  const refresh = vi.fn();
  const runCheckNowAction = vi.fn();
  const result = renderHook(
    ({ pollAction }: { pollAction?: Parameters<typeof useFirstCheckFlow>[0]["pollAction"] }) =>
      useFirstCheckFlow({
        keywordId: KEYWORD_ID,
        pollAction,
        refresh,
        runCheckNowAction,
        ...overrides,
      }),
    { initialProps: { pollAction: overrides.pollAction } },
  );
  return { ...result, refresh, runCheckNowAction };
}

describe("useFirstCheckFlow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows running step for an async running action response", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    expect(result.current.modal?.step).toBe("confirm");
    expect(result.current.modalOpen).toBe(true);

    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("running");
    expect(result.current.modal?.rankCheckId).toBe(CHECK_ID);
  });

  it("shows failed step when poll returns failed with provider_billing", async () => {
    const pollAction = vi.fn().mockResolvedValue(failedResult("provider_billing"));
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("failed");
    expect(result.current.modal?.errorCode).toBe("provider_billing");
  });

  it("shows failed step with null error code when poll returns deferred", async () => {
    const pollAction = vi.fn().mockResolvedValue(deferredResult());
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("failed");
    expect(result.current.modal?.errorCode).toBeNull();
  });

  it("shows success step with position when poll returns completed", async () => {
    const pollAction = vi.fn().mockResolvedValue(completedResult(12, 100));
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { refresh, result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(100));
    await act(async () => {
      await result.current.confirmRun();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("success");
    expect(result.current.modal?.position).toBe(12);
    expect(result.current.modal?.requestedDepth).toBe(100);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("enters success immediately for a synchronous completed response", async () => {
    const runCheckNowAction = vi
      .fn()
      .mockResolvedValue({ ...completedResult(5, 20), rankCheckId: CHECK_ID });
    const { refresh, result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("success");
    expect(result.current.modal?.position).toBe(5);
    expect(result.current.modal?.requestedDepth).toBe(20);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stays in confirm with an honest error when running response lacks a valid rankCheckId", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({ status: "running" });
    const { result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("confirm");
    expect(result.current.modal?.error).toBeTruthy();
  });

  it("tryAgain returns to confirm and clears the terminal run reference", async () => {
    const pollAction = vi.fn().mockResolvedValue(failedResult("provider_billing"));
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("failed");

    act(() => result.current.tryAgain());
    expect(result.current.modal?.step).toBe("confirm");
    expect(result.current.modal?.rankCheckId).toBeNull();
    expect(result.current.modal?.errorCode).toBeNull();
    expect(result.current.modalOpen).toBe(true);
  });

  it("closing while running hides the modal but keeps the active run", async () => {
    const pollAction = vi.fn().mockResolvedValue(runningResult());
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("running");
    expect(result.current.modalOpen).toBe(true);

    act(() => result.current.closeCheckModal());
    expect(result.current.modalOpen).toBe(false);
    expect(result.current.modal?.step).toBe("running");
    expect(result.current.modal?.rankCheckId).toBe(CHECK_ID);

    act(() => result.current.openCheckModal(20));
    expect(result.current.modalOpen).toBe(true);
    expect(result.current.modal?.step).toBe("running");
  });

  it("terminal success calls refresh even while modal is hidden", async () => {
    const pollAction = vi.fn().mockResolvedValue(completedResult());
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { refresh, result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    act(() => result.current.closeCheckModal());
    expect(result.current.modalOpen).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("success");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not auto-submit on tryAgain", async () => {
    const pollAction = vi.fn().mockResolvedValue(failedResult());
    const runCheckNowAction = vi.fn().mockResolvedValue(runningResult());
    const { result } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.modal?.step).toBe("failed");

    act(() => result.current.tryAgain());
    expect(result.current.modal?.step).toBe("confirm");
    expect(runCheckNowAction).toHaveBeenCalledTimes(1);
  });

  it("blocked action stays in confirm with the block message", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      code: "check_in_progress",
      message: "A rank check is already queued or running.",
    });
    const { result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("confirm");
    expect(result.current.modal?.error).toBe("A rank check is already queued or running.");
  });
});
