import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudImportJobData } from "./cloud-token";
import { useCloudImportJobPoll } from "./use-cloud-import-job";

const projectId = "prj_abcdefghijklmnopqrstuvwx";

function job(state: CloudImportJobData["state"], overrides: Partial<CloudImportJobData> = {}) {
  return {
    counts: null,
    createdAt: "2026-07-20T12:00:00.000Z",
    error: null,
    finishedAt: null,
    id: "imp_abcdefghijklmnopqrstuvwx",
    progress: 0,
    startedAt: null,
    state,
    ...overrides,
  } satisfies CloudImportJobData;
}

describe("useCloudImportJobPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls an idle job when a token is waiting to receive", async () => {
    const pollAction = vi
      .fn()
      .mockResolvedValueOnce(job("idle"))
      .mockResolvedValueOnce(job("receiving", { progress: 12 }));

    const { result } = renderHook(() =>
      useCloudImportJobPoll({
        active: true,
        initialJob: job("idle"),
        pollAction,
        projectId,
      }),
    );

    expect(pollAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
    expect(result.current.job.state).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(pollAction).toHaveBeenCalledTimes(2);
    expect(result.current.job.state).toBe("receiving");
  });

  it("continues polling after a transport failure without losing the last job", async () => {
    const pollAction = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(job("done", { progress: 100 }));
    const onTerminal = vi.fn();
    const initialJob = job("importing", { progress: 35 });
    const { result } = renderHook(() =>
      useCloudImportJobPoll({ active: true, initialJob, onTerminal, pollAction, projectId }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.job).toEqual(initialJob);
    expect(result.current.pollError).toBeInstanceOf(TypeError);
    expect(onTerminal).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.job.state).toBe("done");
    expect(result.current.pollError).toBeNull();
    expect(onTerminal).toHaveBeenCalledExactlyOnceWith(job("done", { progress: 100 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(pollAction).toHaveBeenCalledTimes(2);
  });

  it("bounds repeated transport failures and allows a user to retry status reads", async () => {
    const failure = new TypeError("Load failed");
    const pollAction = vi.fn().mockRejectedValue(failure);
    const initialJob = job("importing", { progress: 35 });
    const { result } = renderHook(() =>
      useCloudImportJobPoll({ active: true, initialJob, pollAction, projectId }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(pollAction).toHaveBeenCalledTimes(3);
    expect(result.current.job).toEqual(initialJob);
    expect(result.current.pollError).toBe(failure);

    pollAction.mockResolvedValueOnce(job("done", { progress: 100 }));
    act(() => result.current.retry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(pollAction).toHaveBeenCalledTimes(4);
    expect(result.current.job.state).toBe("done");
    expect(result.current.pollError).toBeNull();
  });

  it("does not retry a failed poll after unmounting", async () => {
    let rejectPoll: (reason: Error) => void = () => undefined;
    const pollAction = vi.fn().mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPoll = reject;
        }),
    );
    const { unmount } = renderHook(() =>
      useCloudImportJobPoll({
        active: true,
        initialJob: job("importing"),
        pollAction,
        projectId,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    unmount();
    await act(async () => {
      rejectPoll(new TypeError("Load failed"));
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(pollAction).toHaveBeenCalledTimes(1);
  });

  it("does not poll an idle job when no token exists", async () => {
    const pollAction = vi.fn();
    renderHook(() =>
      useCloudImportJobPoll({
        active: false,
        initialJob: job("idle"),
        pollAction,
        projectId,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(pollAction).not.toHaveBeenCalled();
  });
});
