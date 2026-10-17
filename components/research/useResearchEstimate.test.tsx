import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import type { KeywordResearchEstimate } from "@/lib/keyword-research/types";
import { deferred } from "@/tests/deferred";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResearchEstimate } from "./useResearchEstimate";

function estimate(costCents: number): KeywordResearchEstimate {
  return {
    cached: false,
    connections: [],
    costCents,
    estimate: true,
    ok: true,
    provider: "DataForSEO",
    sources: [],
  };
}

afterEach(() => vi.useRealTimers());

describe("useResearchEstimate", () => {
  it("ignores a stale estimate that resolves after the latest request", async () => {
    vi.useFakeTimers();
    const first = deferred<KeywordResearchEstimate>();
    const second = deferred<KeywordResearchEstimate>();
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

it("normalizes and deduplicates the same seeds before summing estimates", async () => {
  vi.useFakeTimers();
  const action = vi.fn().mockResolvedValue(estimate(7));
  const { result } = renderHook(() =>
    useResearchEstimate(action, (seed, overrides) => ({
      projectId: "prj_1",
      seed,
      mode: "related",
      resultLimit: 100,
      locationKey: "US",
      ...overrides,
    })),
  );
  act(() => result.current.scheduleEstimate(["Rank", " rank "]));
  await act(async () => vi.advanceTimersByTimeAsync(320));
  expect(action).toHaveBeenCalledTimes(1);
  expect(action.mock.calls[0]?.[0]).toMatchObject({ seed: "rank", estimateOnly: true });
  expect(result.current.estimate.costCents).toBe(7);
});
