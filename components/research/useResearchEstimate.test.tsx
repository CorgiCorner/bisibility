import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import type { KeywordResearchSuccess } from "@/lib/keyword-research/types";
import { deferred } from "@/tests/deferred";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResearchEstimate } from "./useResearchEstimate";

function estimate(costCents: number): KeywordResearchSuccess {
  return {
    cached: false,
    cachedUntil: "2026-07-22T22:00:00.000Z",
    connections: [],
    costCents,
    estimate: true,
    fetchedAt: "2026-07-22T10:00:00.000Z",
    ok: true,
    provider: "DataForSEO",
    rows: [],
    sources: [],
  };
}

describe("useResearchEstimate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores a stale estimate that resolves after the latest request", async () => {
    vi.useFakeTimers();
    const first = deferred<KeywordResearchSuccess>();
    const second = deferred<KeywordResearchSuccess>();
    const researchAction = vi.fn((input: unknown) => {
      const seed = (input as { seed: string }).seed;
      return seed === "first" ? first.promise : second.promise;
    });
    const { result } = renderHook(() =>
      useResearchEstimate(
        researchAction as unknown as ResearchKeywordsAction,
        (seed, overrides) => ({
          includeClickstream: false,
          mode: "auto",
          projectId: "prj_1",
          resultLimit: 100,
          seed,
          ...overrides,
        }),
      ),
    );

    act(() => result.current.scheduleEstimate(["first"]));
    await act(async () => vi.advanceTimersByTimeAsync(320));
    act(() => result.current.scheduleEstimate(["second"]));
    await act(async () => vi.advanceTimersByTimeAsync(320));
    await act(async () => {
      second.resolve(estimate(7));
      await Promise.resolve();
    });
    expect(result.current.estimate.costCents).toBe(7);

    await act(async () => {
      first.resolve(estimate(3));
      await Promise.resolve();
    });
    expect(result.current.estimate.costCents).toBe(7);
  });
});
