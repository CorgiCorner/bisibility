import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/rank-check-status", () => ({ getRankCheckStatus: vi.fn() }));

import type { RunCheckNowResult } from "@/lib/actions/rankCheck";
import type { RunCheckNowAction } from "./action-utils";
import { useFirstCheckFlow } from "./use-first-check-flow";

const KEYWORD_ID = "kw_abcdefghijklmnopqrstuvwx";
const CHECK_ID = "rcr_abcdefghijklmnopqrstuvwx";

function queuedResult(): RunCheckNowResult {
  return { runId: CHECK_ID, status: "queued" };
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
  const runCheckNowAction = vi.fn<RunCheckNowAction>();
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
  it("tracks an accepted queued run through completion without offering a duplicate launch", async () => {
    const runId = "rcr_abcdefghijklmnopqrstuvwx";
    const accepted: RunCheckNowResult = { runId, status: "queued" };
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(accepted);
    const pollAction = vi.fn().mockResolvedValue(completedResult(12, 50));
    const { result, refresh } = renderFlow({ runCheckNowAction, pollAction });

    act(() => result.current.openCheckModal(50));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal).toMatchObject({
      error: null,
      rankCheckId: runId,
      step: "running",
    });
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(runCheckNowAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(pollAction).toHaveBeenCalledWith({ rankCheckId: runId });
    expect(result.current.modal).toMatchObject({
      position: 12,
      requestedDepth: 50,
      step: "success",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows running step for an accepted queued run", async () => {
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue({
      attempts: 1,
      billingUnits: 2,
      position: 5,
      requestedDepth: 20,
      provider: "serpapi",
      status: "completed",
      runId: CHECK_ID,
      rankCheckId: "check_abcdefghijklmnopqrstuvwx",
    });
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

  it("stays in confirm with an honest error when a queued response lacks a valid runId", async () => {
    const runCheckNowAction = vi
      .fn<RunCheckNowAction>()
      .mockResolvedValue({ status: "queued", runId: "invalid" });
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const pollAction = vi.fn().mockResolvedValue({
      status: "running",
      position: null,
      requestedDepth: null,
      error: null,
      errorCode: null,
      finishedAt: null,
    });
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue(queuedResult());
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

  it("shows sample-project refusal as a final failed state", async () => {
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    });
    const { result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("failed");
    expect(result.current.modal?.error).toBeTruthy();
    expect(result.current.modal?.errorCode).toBe("sample_project");
  });

  it("blocked action stays in confirm with the block message", async () => {
    const runCheckNowAction = vi.fn<RunCheckNowAction>().mockResolvedValue({
      code: "check_in_progress",
      status: "not_started",
      message: "A rank check is already queued or running.",
    });
    const { result } = renderFlow({ runCheckNowAction });

    act(() => result.current.openCheckModal(20));
    await act(async () => {
      await result.current.confirmRun();
    });
    expect(result.current.modal?.step).toBe("confirm");
    expect(result.current.modal?.error).toBeTruthy();
  });
});
