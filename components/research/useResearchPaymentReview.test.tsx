import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import { researchScopeForLocationKey } from "@/lib/research/scope";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResearchPaymentReview } from "./useResearchPaymentReview";

const assess = vi.fn(async () => ({ allowed: true, reason: null, charges: [] }));
const scope = researchScopeForLocationKey("US");
const input = (seed: string, overrides = {}) => ({
  seed,
  projectId: "prj_fixture",
  mode: "related" as const,
  resultLimit: 100 as const,
  ...overrides,
});
function response(seed: string, route = "route-1") {
  const quote = paymentQuote({ id: `quote-${seed}`, quoteToken: `token-${seed}-${route}` });
  quote.option = { ...quote.option, id: route };
  return {
    ok: true,
    estimate: true,
    cached: false,
    costCents: 999,
    payment: quote,
    paymentOptions: [quote.option, { ...quote.option, id: "route-2", connectionId: "conn_second" }],
  };
}

describe("research payment review", () => {
  it("never dispatches before confirmation and retains each seed token with its exact request", async () => {
    const action = vi.fn(async ({ seed }: { seed: string }) => response(seed));
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useResearchPaymentReview(action as unknown as ResearchKeywordsAction, input, run, assess),
    );
    await act(async () =>
      result.current.review(
        ["First", "second"],
        { resultLimit: 300, includeClickstream: true },
        scope,
      ),
    );
    expect(run).not.toHaveBeenCalled();
    expect(action.mock.calls).toHaveLength(2);
    expect(action.mock.calls[0][0]).toMatchObject({
      seed: "first",
      resultLimit: 300,
      includeClickstream: true,
      locationKey: "US",
      estimateOnly: true,
    });
    act(() => result.current.confirm());
    expect(run).toHaveBeenCalledWith(
      ["first", "second"],
      expect.objectContaining({ resultLimit: 300, includeClickstream: true, locationKey: "US" }),
      scope,
      {
        first: expect.objectContaining({
          paymentOptionId: "route-1",
          acceptedPayment: { quoteToken: "token-first-route-1" },
        }),
        second: expect.objectContaining({
          paymentOptionId: "route-1",
          acceptedPayment: { quoteToken: "token-second-route-1" },
        }),
      },
    );
    act(() => result.current.confirm());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("re-quotes only the selected seed route and never reuses its old consent", async () => {
    const action = vi.fn(
      async ({ seed, paymentOptionId }: { seed: string; paymentOptionId?: string }) =>
        response(seed, paymentOptionId),
    );
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useResearchPaymentReview(action as unknown as ResearchKeywordsAction, input, run, assess),
    );
    await act(async () => result.current.review(["one", "two"], {}, scope));
    await act(async () => result.current.changeOption("two", "route-2"));
    expect(action).toHaveBeenLastCalledWith(
      expect.objectContaining({ seed: "two", paymentOptionId: "route-2", estimateOnly: true }),
    );
    act(() => result.current.confirm());
    expect(run.mock.calls[0][3].one.acceptedPayment.quoteToken).toBe("token-one-route-1");
    expect(run.mock.calls[0][3].two.acceptedPayment.quoteToken).toBe("token-two-route-2");
  });

  it("preserves quoted scope through later form changes and fences duplicate confirmation", async () => {
    let currentMode = "related" as const;
    const action = vi.fn(async ({ seed }: { seed: string }) => response(seed));
    const run = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useResearchPaymentReview(
        action as unknown as ResearchKeywordsAction,
        (seed, overrides) => ({ ...input(seed, overrides), mode: currentMode }),
        run,
        assess,
      ),
    );
    await act(async () => result.current.review(["seed"], {}, scope));
    const confirm = result.current.confirm;
    currentMode = "ideas" as typeof currentMode;
    act(() => {
      confirm();
      confirm();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][3].seed).toMatchObject({
      mode: "related",
      locationKey: "US",
      acceptedPayment: { quoteToken: "token-seed-route-1" },
    });
  });

  it("requires the server's batch affordability decision even if every individual quote allows execution", async () => {
    const action = vi.fn(async ({ seed }: { seed: string }) => response(seed));
    const assessment = vi.fn(async () => ({
      allowed: false,
      reason: "insufficient_credits",
      charges: [paymentQuote().charge],
    }));
    const run = vi.fn();
    const { result } = renderHook(() =>
      useResearchPaymentReview(action as unknown as ResearchKeywordsAction, input, run, assessment),
    );
    await act(async () => result.current.review(["one", "two"], {}, scope));
    expect(assessment).toHaveBeenCalledWith({
      projectId: "prj_fixture",
      quotes: [{ quoteToken: "token-one-route-1" }, { quoteToken: "token-two-route-1" }],
    });
    expect(result.current.draft?.assessment?.reason).toBe("insufficient_credits");
    act(() => result.current.confirm());
    expect(run).not.toHaveBeenCalled();
  });
  it.each(["missing", "expired", "blocked"])(
    "fails closed for %s quote without a paid fallback",
    async (state) => {
      const reply = response("seed");
      if (state === "expired") reply.payment.expiresAt = "2000-01-01T00:00:00Z";
      if (state === "blocked") reply.payment.availability.allowed = false;
      if (state === "missing") delete (reply as { payment?: unknown }).payment;
      const run = vi.fn();
      const { result } = renderHook(() =>
        useResearchPaymentReview(vi.fn().mockResolvedValue(reply), input, run, assess),
      );
      await act(async () => result.current.review(["seed"], {}, scope));
      act(() => result.current.confirm());
      expect(run).not.toHaveBeenCalled();
    },
  );
});

it("refreshes expired seed quotes from retained requests even when current defaults change", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  let currentLimit = 100;
  let quoteVersion = 0;
  const action = vi.fn(async ({ seed }: { seed: string }) => {
    quoteVersion++;
    const result = response(seed);
    result.payment = paymentQuote({
      quoteToken: `refreshed-${quoteVersion}`,
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    return result;
  });
  const run = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useResearchPaymentReview(
      action as never,
      (seed, overrides) => ({ ...input(seed, overrides), resultLimit: currentLimit }) as never,
      run,
      assess,
    ),
  );
  try {
    await act(async () => result.current.review(["first"], {}, scope));
    currentLimit = 500;
    vi.setSystemTime(new Date(Date.now() + 1001));
    act(() => result.current.confirm());
    expect(run).not.toHaveBeenCalled();
    await act(async () => result.current.refresh());
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][0]).toMatchObject({
      resultLimit: 100,
      seed: "first",
      estimateOnly: true,
    });
    act(() => result.current.confirm());
    expect(run).toHaveBeenCalledWith(
      ["first"],
      expect.anything(),
      scope,
      expect.objectContaining({
        first: expect.objectContaining({
          resultLimit: 100,
          acceptedPayment: { quoteToken: "refreshed-2" },
        }),
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});
