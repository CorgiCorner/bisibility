import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActionPaymentReview } from "./ActionPaymentReview";
import { PaymentChargeLine } from "./PaymentChargeLine";
import { paymentQuote } from "./payment-test-fixture";

const projectRef = "prj_cachewindow000000000001";

function review(node: ReactNode, canEditProject: boolean) {
  return render(
    <ProjectWriteModeProvider
      canEditProject={canEditProject}
      projectRef={projectRef}
      writeMode="active"
    >
      {node}
    </ProjectWriteModeProvider>,
  );
}

const handlers = { onClose: vi.fn(), onConfirm: vi.fn(), onOptionChange: vi.fn() };
describe("action payment presentation", () => {
  it("uses arbitrary server-native units without guessing from provider name or USD", () => {
    const quote = paymentQuote();
    render(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
      />,
    );
    expect(screen.getByText("≈ 4 tokens")).toBeInTheDocument();
    expect(screen.queryByText(/Available:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("renders retained receipt rather than current route and keeps unknown charge explicit", () => {
    const quote = paymentQuote();
    render(
      <PaymentChargeLine
        payment={{
          actionId: "action",
          quoteId: null,
          option: quote.option,
          state: "unknown",
          charge: { ...quote.charge, value: null, certainty: "unknown" },
        }}
      />,
    );
    expect(screen.getByText("On your Example provider key")).toBeInTheDocument();
    expect(screen.getByText("Charge not confirmed")).toBeInTheDocument();
  });
  it("offers Add credits as the primary action only for an authorized insufficient-credit assessment", () => {
    const quote = paymentQuote();
    quote.option = { ...quote.option, fundingSource: "platform" };
    const assessment = {
      allowed: false,
      reason: "insufficient_credits",
      charges: [quote.charge],
      remedyHref: "/account/funding",
      wallet: {
        available: {
          value: "1",
          certainty: "measured" as const,
          unit: { kind: "credits" as const, key: "credit", singular: "Credit", plural: "Credits" },
        },
        canAddCredits: true,
      },
    };
    const { rerender } = render(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
        assessment={assessment}
      />,
    );
    const add = screen.getByRole("link", { name: "Add credits" });
    expect(add).toHaveAttribute("data-variant", "primary");
    expect(add).toHaveAttribute("href", "/account/funding");
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Available: 1 Credit")).toHaveLength(1);
    rerender(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
        assessment={{ ...assessment, reason: "subscription_required" }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Add credits" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("does not reveal a credit-purchase action without owner-authorized wallet details", () => {
    const quote = paymentQuote();
    quote.option = { ...quote.option, fundingSource: "platform" };
    render(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
        assessment={{
          allowed: false,
          reason: "insufficient_credits",
          charges: [quote.charge],
          remedyHref: "/account/funding",
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Add credits" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("hides the previous route's price while a different option is being quoted", () => {
    const quote = paymentQuote();
    render(
      <ActionPaymentReview
        {...handlers}
        loading
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
      />,
    );
    expect(screen.queryByText("≈ 4 tokens")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("text-[12px]", "text-fg-muted");
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  it("shows how long a paid miss stays free and links editors to the cache setting", () => {
    const onRefresh = vi.fn();
    const quote = paymentQuote({
      cache: { state: "miss", freeUntil: null, windowSeconds: 43_200 },
    });
    review(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        onRefresh={onRefresh}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
      />,
      true,
    );
    expect(screen.getByText("Result stays free to reopen for 12 hours")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Change" });
    expect(link).toHaveAttribute("href", `/app/${projectRef}/settings/general#data-cache`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    fireEvent.click(screen.getByRole("button", { name: "Refresh estimate" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("shows a day window for a mixed quote and hides the settings link without edit permission", () => {
    const quote = paymentQuote({
      cache: { state: "mixed", freeUntil: null, windowSeconds: 2_592_000 },
    });
    review(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        onRefresh={vi.fn()}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
      />,
      false,
    );
    expect(screen.getByText("Result stays free to reopen for 30 days")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh estimate" })).toBeInTheDocument();
  });

  it("does not announce a reuse window for a cache hit", () => {
    const quote = paymentQuote({
      cache: { state: "hit", freeUntil: "2099-01-01T00:00:00Z", windowSeconds: 43_200 },
      charge: { ...paymentQuote().charge, value: "0", certainty: "free" },
    });
    review(
      <ActionPaymentReview
        {...handlers}
        loading={false}
        failed={false}
        items={[{ key: "seed", label: "seed", quote, options: [quote.option] }]}
      />,
      true,
    );
    expect(screen.queryByText(/Result stays free to reopen/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change" })).not.toBeInTheDocument();
  });
});
