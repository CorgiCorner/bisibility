import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRankCheckBatchPoll } from "./use-rank-check-batch-poll";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";
const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `check_${index.toString(36).padStart(24, "a")}`);
function result(rankCheckId: string, status = "running") {
  return {
    error: null,
    errorCode: null,
    finishedAt: status === "running" ? null : "2026-08-21T12:00:00.000Z",
    position: status === "completed" ? 3 : null,
    rankCheckId,
    requestedDepth: status === "completed" ? 100 : null,
    status,
  };
}

describe("useRankCheckBatchPoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("splits more than 100 ids into bounded chunks and combines their results", async () => {
    const rankCheckIds = ids(205);
    const pollAction = vi.fn(async ({ rankCheckIds: chunk }: { rankCheckIds: string[] }) =>
      chunk.map((id) => result(id, "completed")),
    );
    const onTerminal = vi.fn();
    renderHook(() =>
      useRankCheckBatchPoll({ onTerminal, pollAction, projectId: PROJECT_ID, rankCheckIds }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(pollAction.mock.calls.map(([input]) => input.rankCheckIds.length)).toEqual([
      100, 100, 5,
    ]);
    expect(onTerminal).toHaveBeenCalledTimes(205);
  });

  it.each(["completed", "failed", "deferred"])("terminalizes %s immediately", async (status) => {
    const [rankCheckId] = ids(1);
    const rankCheckIds = [rankCheckId];
    const pollAction = vi.fn().mockResolvedValue([result(rankCheckId, status)]);
    const onTerminal = vi.fn();
    renderHook(() =>
      useRankCheckBatchPoll({ onTerminal, pollAction, projectId: PROJECT_ID, rankCheckIds }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledWith(expect.objectContaining({ status }));
    expect(pollAction).toHaveBeenCalledOnce();
  });

  it("retries two rejected cycles with 5s then 10s backoff", async () => {
    const pollAction = vi.fn().mockRejectedValue(new Error("unavailable"));
    const onTerminal = vi.fn();
    renderHook(() =>
      useRankCheckBatchPoll({
        onTerminal,
        pollAction,
        projectId: PROJECT_ID,
        rankCheckIds: ids(2),
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await act(async () => vi.advanceTimersByTimeAsync(4999));
    expect(pollAction).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await act(async () => vi.advanceTimersByTimeAsync(9999));
    expect(pollAction).toHaveBeenCalledTimes(2);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("terminalizes every outstanding id once after the third rejection and stops", async () => {
    const rankCheckIds = ids(3);
    const pollAction = vi.fn().mockRejectedValue(new Error("unavailable"));
    const onTerminal = vi.fn();
    renderHook(() =>
      useRankCheckBatchPoll({ onTerminal, pollAction, projectId: PROJECT_ID, rankCheckIds }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(17_000));
    expect(pollAction).toHaveBeenCalledTimes(3);
    expect(onTerminal).toHaveBeenCalledTimes(3);
    expect(onTerminal).toHaveBeenCalledWith({
      error: "The rank check status could not be confirmed after repeated attempts.",
      errorCode: "status_unavailable",
      finishedAt: null,
      position: null,
      rankCheckId: rankCheckIds[0],
      requestedDepth: null,
      status: "failed",
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(pollAction).toHaveBeenCalledTimes(3);
    expect(onTerminal).toHaveBeenCalledTimes(3);
  });

  it("resets the rejection counter after a fully successful running cycle", async () => {
    const [rankCheckId] = ids(1);
    const pollAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockResolvedValueOnce([result(rankCheckId)])
      .mockRejectedValue(new Error("after reset"));
    const onTerminal = vi.fn();
    renderHook(() =>
      useRankCheckBatchPoll({
        onTerminal,
        pollAction,
        projectId: PROJECT_ID,
        rankCheckIds: [rankCheckId],
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(32_000));
    expect(pollAction).toHaveBeenCalledTimes(5);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("does not invoke callbacks after unmount during a pending cycle", async () => {
    const [rankCheckId] = ids(1);
    let resolve: ((value: ReturnType<typeof result>[]) => void) | undefined;
    const pollAction = vi.fn(
      () =>
        new Promise<ReturnType<typeof result>[]>((done) => {
          resolve = done;
        }),
    );
    const onTerminal = vi.fn();
    const { unmount } = renderHook(() =>
      useRankCheckBatchPoll({
        onTerminal,
        pollAction,
        projectId: PROJECT_ID,
        rankCheckIds: [rankCheckId],
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    unmount();
    await act(async () => resolve?.([result(rankCheckId, "completed")]));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(onTerminal).not.toHaveBeenCalled();
    expect(pollAction).toHaveBeenCalledOnce();
  });
});
