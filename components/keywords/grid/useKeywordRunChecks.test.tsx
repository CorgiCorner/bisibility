import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { deferred } from "@/tests/deferred";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useKeywordRunChecks } from "./useKeywordRunChecks";

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <SessionSpendProvider>{children}</SessionSpendProvider>;
}

describe("useKeywordRunChecks", () => {
  it("tracks pending ids, reports failures, and settles once after the batch", async () => {
    const first = deferred();
    const second = deferred();
    const runCheckNowAction = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useKeywordRunChecks(runCheckNowAction, onSettled), {
      wrapper,
    });
    let request!: Promise<void>;

    act(() => {
      request = result.current.runChecks(["kw_1", "kw_2"], 20);
    });

    expect(runCheckNowAction).toHaveBeenNthCalledWith(1, { depth: 20, keywordId: "kw_1" });
    expect(runCheckNowAction).toHaveBeenNthCalledWith(2, { depth: 20, keywordId: "kw_2" });
    expect(result.current.pendingIds).toEqual(new Set(["kw_1", "kw_2"]));
    expect(result.current.running).toBe(true);
    expect(result.current.checkFailed).toBe(false);
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      first.resolve({ status: "queued" });
      second.reject(new Error("provider unavailable"));
      await request;
    });

    expect(result.current.pendingIds).toEqual(new Set());
    expect(result.current.running).toBe(false);
    expect(result.current.checkFailed).toBe(true);
    expect(result.current.statusLabel).toBe("Started 1 rank check. 1 rank check failed to start.");
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("tracks overlapping batches independently and preserves an earlier failure", async () => {
    const first = deferred();
    const second = deferred();
    const runCheckNowAction = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useKeywordRunChecks(runCheckNowAction, onSettled), {
      wrapper,
    });
    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;

    act(() => {
      firstRequest = result.current.runChecks(["kw_1"]);
    });
    act(() => {
      secondRequest = result.current.runChecks(["kw_2"]);
    });

    expect(runCheckNowAction).toHaveBeenNthCalledWith(2, { keywordId: "kw_2" });
    expect(result.current.pendingIds).toEqual(new Set(["kw_1", "kw_2"]));

    await act(async () => {
      first.reject(new Error("provider unavailable"));
      await firstRequest;
    });
    expect(result.current.pendingIds).toEqual(new Set(["kw_2"]));
    expect(result.current.checkFailed).toBe(true);

    await act(async () => {
      second.resolve({ status: "queued" });
      await secondRequest;
    });
    expect(result.current.pendingIds).toEqual(new Set());
    expect(result.current.checkFailed).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("does not start a duplicate check for a pending keyword", async () => {
    const pending = deferred();
    const runCheckNowAction = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() => useKeywordRunChecks(runCheckNowAction), { wrapper });
    let request!: Promise<void>;

    act(() => {
      request = result.current.runChecks(["kw_1"]);
    });
    await act(async () => result.current.runChecks(["kw_1"]));
    expect(runCheckNowAction).toHaveBeenCalledOnce();

    await act(async () => {
      pending.resolve({ status: "queued" });
      await request;
    });
  });

  it("adds estimated spend only for checks that started", async () => {
    const runCheckNowAction = vi
      .fn()
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValueOnce({
        code: "budget_exhausted",
        message: "Rank check monthly budget reached.",
        status: "not_started",
      });
    const { result } = renderHook(
      () => ({
        ...useKeywordRunChecks(runCheckNowAction, undefined, {
          providerRate: { overrideCents: 2, providerId: "dataforseo" },
          rows: keywordRows.slice(0, 2),
        }),
        sessionCents: useSessionSpend().sessionCents,
      }),
      { wrapper },
    );

    await act(async () => result.current.runChecks(keywordRows.slice(0, 2).map((row) => row.id)));

    expect(result.current.sessionCents).toBe(2);
    expect(result.current.statusLabel).toBe("Started 1 rank check. 1 rank check failed to start.");
  });
});
