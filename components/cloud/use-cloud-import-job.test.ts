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
