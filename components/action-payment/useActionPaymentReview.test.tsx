import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { paymentQuote } from "./payment-test-fixture";
import { useActionPaymentReview } from "./useActionPaymentReview";

const assess = async () => ({ allowed: true, reason: null, charges: [paymentQuote().charge] });
function reply(route = "route-1") {
  const quote = paymentQuote({ quoteToken: `token-${route}` });
  quote.option.id = route;
  if (route === "route-2") {
    quote.option.providerId = "another-provider";
    quote.option.payableUnit = {
      ...quote.option.payableUnit,
      providerId: "another-provider",
    } as typeof quote.option.payableUnit;
    quote.charge.unit = quote.option.payableUnit;
  }
  return {
    ok: true,
    estimate: true,
    payment: quote,
    paymentOptions: [
      quote.option,
      {
        ...quote.option,
        id: "route-2",
        providerId: "another-provider",
        payableUnit: { ...quote.option.payableUnit, providerId: "another-provider" },
      },
    ],
  };
}

describe("single action payment review", () => {
  it("quotes exact scope without dispatch and binds confirmed token once", async () => {
    const action = vi.fn(async (input: unknown) =>
      (input as { estimateOnly?: boolean }).estimateOnly ? reply() : { ok: true, completed: true },
    );
    const { result } = renderHook(() => useActionPaymentReview(assess));
    const input = {
      projectId: "project",
      target: "original.example",
      snapshotRef: "revision-one",
      offset: 100,
    };
    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.request(action, input, "original.example");
    });
    input.target = "changed.example";
    await waitFor(() => expect(result.current.draft?.loading).toBe(false));
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][0]).toMatchObject({
      target: "original.example",
      snapshotRef: "revision-one",
      offset: 100,
      estimateOnly: true,
    });
    const confirm = result.current.confirm;
    await act(async () => {
      confirm();
      confirm();
      await pending;
    });
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1][0]).toMatchObject({
      target: "original.example",
      snapshotRef: "revision-one",
      offset: 100,
      acceptedPayment: { quoteToken: "token-route-1" },
      paymentOptionId: "route-1",
      requirePayment: true,
      estimateOnly: false,
    });
  });

  it("re-quotes a real alternative without reusing the previous price or token", async () => {
    const action = vi.fn(async (input: unknown) => {
      const request = input as { estimateOnly?: boolean; paymentOptionId?: string };
      return request.estimateOnly ? reply(request.paymentOptionId) : { ok: true };
    });
    const { result } = renderHook(() => useActionPaymentReview(assess));
    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.request(
        action,
        { projectId: "project", provider: "first-provider", target: "site" },
        "site",
        (input, option) => ({ ...input, provider: option.providerId, paymentOptionId: option.id }),
      );
    });
    await waitFor(() => expect(result.current.draft?.loading).toBe(false));
    act(() => result.current.selectOption("action", "route-2"));
    expect(result.current.draft?.quote).toBeUndefined();
    await waitFor(() => expect(result.current.draft?.loading).toBe(false));
    await act(async () => {
      result.current.confirm();
      await pending;
    });
    expect(action.mock.calls[2][0]).toMatchObject({
      provider: "another-provider",
      acceptedPayment: { quoteToken: "token-route-2" },
      paymentOptionId: "route-2",
    });
  });

  it("cancels without dispatching or replacing a previous snapshot", async () => {
    const action = vi.fn().mockResolvedValue(reply());
    const { result } = renderHook(() => useActionPaymentReview(assess));
    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.request(action, { projectId: "project", target: "site" }, "site");
    });
    await waitFor(() => expect(result.current.draft?.loading).toBe(false));
    let value: unknown;
    await act(async () => {
      result.current.close();
      value = await pending;
    });
    expect(value).toBeNull();
    expect(action).toHaveBeenCalledOnce();
  });

  it.each(["missing", "expired", "insufficient"])(
    "refuses paid dispatch for %s quote",
    async (kind) => {
      const response = reply();
      if (kind === "expired") response.payment.expiresAt = "2000-01-01T00:00:00Z";
      const action = vi
        .fn()
        .mockResolvedValue(
          kind === "missing" ? { ok: true, estimate: true, costCents: 99 } : response,
        );
      const { result } = renderHook(() =>
        useActionPaymentReview(async () => ({
          allowed: kind !== "insufficient",
          reason: kind === "insufficient" ? "insufficient_credits" : null,
          charges: [],
        })),
      );
      act(() => {
        void result.current.request(action, { projectId: "project", target: "site" }, "site");
      });
      await waitFor(() => expect(result.current.draft?.loading).toBe(false));
      act(() => result.current.confirm());
      expect(action).toHaveBeenCalledTimes(kind === "expired" ? 2 : 1);
      expect(
        action.mock.calls.every(([input]) => (input as { estimateOnly?: boolean }).estimateOnly),
      ).toBe(true);
      act(() => result.current.close());
    },
  );
});
