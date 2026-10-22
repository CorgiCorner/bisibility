import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ActionPaymentModal } from "./ActionPaymentModal";
import { paymentQuote } from "./payment-test-fixture";
import { useActionPaymentReview } from "./useActionPaymentReview";

it("updates at expiry, re-quotes the frozen nested scope, and executes only after new consent", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  const input = { projectId: "project", scope: { markets: ["PL"], offset: 100 } };
  let estimateCount = 0;
  const action = vi.fn(async (value: unknown) => {
    if (!(value as { estimateOnly?: boolean }).estimateOnly) return { ok: true };
    estimateCount++;
    return {
      ok: true,
      estimate: true,
      paymentOptions: [],
      payment: paymentQuote({
        quoteToken: `token-${estimateCount}`,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      }),
    };
  });
  function Harness() {
    const review = useActionPaymentReview(async () => ({
      allowed: true,
      reason: null,
      charges: [paymentQuote().charge],
    }));
    return (
      <>
        <button type="button" onClick={() => void review.request(action, input, "Exact snapshot")}>
          Review
        </button>
        <ActionPaymentModal review={review} />
      </>
    );
  }
  try {
    render(<Harness />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Review" })));
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    input.scope.markets[0] = "US";
    input.scope.offset = 900;
    await act(async () => vi.advanceTimersByTimeAsync(1001));
    expect(screen.getByRole("alert")).toHaveTextContent("This price expired.");
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledOnce();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh price" })));
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start" })));
    expect(action).toHaveBeenCalledTimes(3);
    expect(action.mock.calls[2][0]).toMatchObject({
      scope: { markets: ["PL"], offset: 100 },
      estimateOnly: false,
      acceptedPayment: { quoteToken: "token-2" },
    });
  } finally {
    vi.useRealTimers();
  }
});
