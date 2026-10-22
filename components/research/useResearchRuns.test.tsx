import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
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

it("budget regression: blocks research with the missing-budget state", async () => {
  const outcome = {
    ok: false as const,
    reason: "budget_exhausted" as const,
    budgetReason: "budget_missing" as const,
  };
  const { result } = renderHook(() =>
    useResearchRuns({
      addSpend: vi.fn(),
      connectionId: "",
      includeClickstream: false,
      initialBudgetBlocked: false,
      scope: researchScopeForLocationKey("US"),
      mode: "related",
      projectId: "prj_fixture",
      recent: { add: vi.fn() },
      researchAction: vi.fn().mockResolvedValue(outcome),
      resultLimit: 100,
    }),
  );
  await act(async () => result.current.runResearch(["rank tracker"]));
  expect(result.current.activeTab?.outcome).toEqual(outcome);
  expect(result.current.budgetBlocked).toBe(true);
  expect(result.current.budgetMissing).toBe(true);
});

it("blocks wallet-denied research without presenting a project budget denial", async () => {
  const outcome = { ok: false as const, reason: "wallet_budget_exhausted" as const, costCents: 0 };
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
      researchAction: vi.fn().mockResolvedValue(outcome),
      resultLimit: 100,
    }),
  );
  await act(async () => result.current.runResearch(["rank tracker"]));
  expect(result.current.activeTab?.outcome).toEqual(outcome);
  expect(result.current.budgetBlocked).toBe(true);
  expect(result.current.budgetState).toBe("wallet_budget_exhausted");
  expect(addSpend).not.toHaveBeenCalled();
  expect(recent.add).not.toHaveBeenCalled();
});

it("does not submit duplicate normalized seeds or create duplicate tabs in one run", async () => {
  const researchAction = vi
    .fn()
    .mockResolvedValue({ ok: false, reason: "lookup_failed", charged: null });
  const { result } = renderHook(() =>
    useResearchRuns({
      addSpend: vi.fn(),
      connectionId: "",
      includeClickstream: false,
      initialBudgetBlocked: false,
      scope: researchScopeForLocationKey("US"),
      mode: "related",
      projectId: "prj_fixture",
      recent: { add: vi.fn() },
      researchAction,
      resultLimit: 100,
    }),
  );
  await act(async () => result.current.runResearch(["Rank", " rank "]));
  expect(result.current.tabs).toHaveLength(1);
  expect(result.current.activeTab).toBe(result.current.tabs[0]);
  expect(researchAction.mock.calls[0]?.[0].seed).toBe("rank");
  expect(researchAction.mock.calls.filter(([input]) => !input.estimateOnly)).toHaveLength(1);
});

it("retains the approved route in dispatch, follow-up quotes, tabs and recent receipt", async () => {
  const quote = paymentQuote();
  const payment = {
    actionId: "executed",
    quoteId: quote.id,
    option: quote.option,
    state: "settled" as const,
    charge: { ...quote.charge, certainty: "measured" as const },
  };
  const success = {
    ok: true as const,
    cached: false,
    cachedUntil: "2099-01-01T00:00:00Z",
    connections: [],
    costCents: 9,
    fetchedAt: "2026-10-21T00:00:00Z",
    provider: "Example provider",
    rows: [],
    sources: [],
    payment,
  };
  const researchAction = vi.fn(async (input: { estimateOnly?: boolean }) =>
    input.estimateOnly ? { ...success, estimate: true, payment: quote } : success,
  );
  const recent = { add: vi.fn() };
  const { result } = renderHook(() =>
    useResearchRuns({
      addSpend: vi.fn(),
      connectionId: "conn_old",
      includeClickstream: true,
      initialBudgetBlocked: false,
      scope: researchScopeForLocationKey("US"),
      mode: "auto",
      projectId: "prj_fixture",
      recent,
      researchAction: researchAction as unknown as ResearchKeywordsAction,
      resultLimit: 500,
    }),
  );
  await act(async () =>
    result.current.runResearch(["seed"], {}, researchScopeForLocationKey("US"), {
      seed: {
        seed: "seed",
        projectId: "prj_fixture",
        mode: "related",
        resultLimit: 100,
        includeClickstream: false,
        connectionId: "conn_selected",
        paymentOptionId: "route-selected",
        acceptedPayment: { quoteToken: "exact-token" },
      },
    }),
  );
  expect(researchAction.mock.calls[0][0]).toMatchObject({
    estimateOnly: false,
    connectionId: "conn_selected",
    paymentOptionId: "route-selected",
    resultLimit: 100,
    mode: "related",
    includeClickstream: false,
    acceptedPayment: { quoteToken: "exact-token" },
  });
  expect(researchAction.mock.calls[1][0]).toMatchObject({
    estimateOnly: true,
    connectionId: "conn_selected",
    paymentOptionId: "route-selected",
    resultLimit: 300,
    acceptedPayment: undefined,
  });
  expect(result.current.activeTab).toMatchObject({
    connectionId: "conn_selected",
    paymentOptionId: "route-selected",
    requestedLimit: 100,
    mode: "related",
    includeClickstream: false,
  });
  expect(recent.add).toHaveBeenCalledWith(
    expect.objectContaining({ connectionId: "conn_selected", payment }),
  );
});
