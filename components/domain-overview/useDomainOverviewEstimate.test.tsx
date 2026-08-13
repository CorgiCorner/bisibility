import type { AnalyzeDomainOverviewAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewEstimate } from "@/lib/domain-overview/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDomainOverviewEstimate } from "./useDomainOverviewEstimate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function serverEstimate(target: string, costCents: number): DomainOverviewEstimate {
  return {
    cached: costCents === 0,
    estimate: true,
    estimatedCostCents: costCents,
    freshEstimatedCostCents: 6,
    historyEstimatedCostCents: 12,
    historyMode: "lazy",
    keywordPageEstimatedCostCents: 2,
    languageCode: "en",
    locationCode: 2840,
    ok: true,
    pagePageEstimatedCostCents: 3,
    provider: "dataforseo",
    scope: "root",
    target,
  };
}

afterEach(() => vi.useRealTimers());

describe("useDomainOverviewEstimate", () => {
  it("invalidates the previous price synchronously and ignores a late stale response", async () => {
    vi.useFakeTimers();
    const first = deferred<DomainOverviewEstimate>();
    const second = deferred<DomainOverviewEstimate>();
    const action = vi.fn((input: unknown) => {
      const target = (input as { target: string }).target;
      return target === "first.example" ? first.promise : second.promise;
    });
    const { result } = renderHook(() =>
      useDomainOverviewEstimate(
        action as unknown as AnalyzeDomainOverviewAction,
        (target) => ({ estimateOnly: true, projectId: "prj_1", target }),
        {
          cached: true,
          costCents: 0,
          freshCostCents: 6,
          historyCostCents: 0,
          keywordPageCostCents: 2,
          loading: false,
          pagePageCostCents: 3,
          valid: true,
        },
      ),
    );

    act(() => result.current.scheduleEstimate("first.example"));
    expect(result.current.estimate).toMatchObject({
      costCents: null,
      loading: true,
      valid: false,
    });
    await act(async () => vi.advanceTimersByTimeAsync(320));

    act(() => result.current.scheduleEstimate("second.example"));
    await act(async () => vi.advanceTimersByTimeAsync(320));
    await act(async () => {
      second.resolve(serverEstimate("second.example", 7));
      await Promise.resolve();
    });
    expect(result.current.estimate.costCents).toBe(7);

    await act(async () => {
      first.resolve(serverEstimate("first.example", 3));
      await Promise.resolve();
    });
    expect(result.current.estimate.costCents).toBe(7);
  });
});
