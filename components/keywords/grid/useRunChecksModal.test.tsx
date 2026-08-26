import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRunChecksModal } from "./useRunChecksModal";

const CHECK_ID = "check_abcdefghijklmnopqrstuvwx";
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionSpendProvider>{children}</SessionSpendProvider>
);

describe("useRunChecksModal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps batch polling after the running modal closes and refreshes on terminal", async () => {
    const onSettled = vi.fn();
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: null,
        errorCode: null,
        finishedAt: "2026-08-21T12:00:00.000Z",
        position: 2,
        rankCheckId: CHECK_ID,
        requestedDepth: 20,
        status: "completed",
      },
    ]);
    const runCheckNowAction = vi.fn().mockResolvedValue({ ok: true, rankCheckId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled,
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );

    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    expect(result.current.flow?.step).toBe("running");
    act(() => result.current.close());
    expect(result.current.flow).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(pollAction).toHaveBeenCalledWith({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      rankCheckIds: [CHECK_ID],
    });
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(result.current.flow).toBeNull();
  });
  it("settles a check that disappears from the project-scoped poll result", async () => {
    const onSettled = vi.fn();
    const pollAction = vi.fn().mockResolvedValue([]);
    const runCheckNowAction = vi.fn().mockResolvedValue({ ok: true, rankCheckId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled,
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );

    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(result.current.flow).toMatchObject({
      failures: [
        expect.objectContaining({
          message: "The rank check is no longer available.",
          rankCheckId: CHECK_ID,
        }),
      ],
      rankCheckIds: [],
      step: "failed",
    });
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(pollAction).toHaveBeenCalledTimes(1);
  });
  it("maps deferred terminal status to the explicit neutral presentation", async () => {
    const pollAction = vi.fn().mockResolvedValue([
      {
        error: "raw deferred detail",
        errorCode: "provider_auth",
        finishedAt: null,
        position: null,
        rankCheckId: CHECK_ID,
        requestedDepth: null,
        status: "deferred",
      },
    ]);
    const runCheckNowAction = vi.fn().mockResolvedValue({ ok: true, rankCheckId: CHECK_ID });
    const { result } = renderHook(
      () =>
        useRunChecksModal({
          onSettled: vi.fn(),
          pollAction,
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          rows: [],
          runCheckNowAction,
        }),
      { wrapper },
    );
    act(() => result.current.request(["kw_abcdefghijklmnopqrstuvwx"]));
    await act(async () => result.current.confirm());
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.flow).toMatchObject({
      failures: [
        {
          code: "rank_check_deferred",
          message:
            "The rank check was deferred and did not complete. View check details for more information, then try again when the blocking condition is resolved.",
          rankCheckId: CHECK_ID,
        },
      ],
      step: "failed",
    });
  });
});
