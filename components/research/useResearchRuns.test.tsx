import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import { researchScopeForLocationKey } from "@/lib/research/scope";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { researchFailureState } from "./research-workspace-model";
import { useResearchRuns } from "./useResearchRuns";

describe("research account restriction recovery", () => {
  it("preserves the server outcome and its cost through the research tab", async () => {
    const outcome = { ok: false as const, reason: "account_restricted" as const, costCents: 0 };
    const researchAction = vi.fn().mockResolvedValue(outcome);
    const addSpend = vi.fn();
    const recent = { add: vi.fn() };
    const { result } = renderHook(() =>
      useResearchRuns({
        addSpend,
        connectionId: "",
        includeClickstream: false,
        initialBudgetBlocked: false,
        scope: researchScopeForLocationKey("US"),
        mode: "related",
        projectId: "prj_fixture",
        recent,
        researchAction: researchAction as ResearchKeywordsAction,
        resultLimit: 100,
      }),
    );
    await act(async () => result.current.runResearch(["rank tracker"]));
    expect(result.current.activeTab?.outcome).toEqual(outcome);
    expect(researchFailureState(outcome)).toBe("account_restricted");
    expect(result.current.researching).toBe(false);
    expect(addSpend).not.toHaveBeenCalled();
    expect(recent.add).not.toHaveBeenCalled();
    expect(researchAction.mock.calls.filter(([input]) => !input.estimateOnly)).toHaveLength(1);
  });
});
