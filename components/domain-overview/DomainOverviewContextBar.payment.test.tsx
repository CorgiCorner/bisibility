import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DomainOverviewContextBar } from "./DomainOverviewContextBar";
import { domainOverviewReportFixture } from "./fixtures";

it("keeps the stored result source distinct from a different payer on a free cache read", () => {
  const quote = paymentQuote({
    charge: { value: "4", certainty: "estimate", unit: { kind: "currency", code: "USD" } },
  });
  const originalPayment = {
    actionId: "original",
    quoteId: quote.id,
    option: { ...quote.option, providerId: "original-index", providerLabel: "Original index" },
    state: "settled" as const,
    charge: { ...quote.charge, certainty: "measured" as const },
  };
  const payment = {
    ...originalPayment,
    actionId: "cache-read",
    state: "free" as const,
    option: { ...quote.option, providerId: "new-payer", providerLabel: "Different payer" },
    charge: { ...quote.charge, value: "0", certainty: "free" as const },
  };
  render(
    <DomainOverviewContextBar
      dateFormat="month_first"
      report={{
        ...domainOverviewReportFixture,
        provider: "original-index",
        originalPayment,
        payment,
      }}
    />,
  );
  expect(screen.getByText("Original index")).toBeInTheDocument();
  expect(screen.queryByText("Different payer")).not.toBeInTheDocument();
});

it("places refresh beside the report context as an outline action", () => {
  render(
    <DomainOverviewContextBar
      dateFormat="month_first"
      refresh={{ onClick: () => undefined, price: "Review price" }}
      report={domainOverviewReportFixture}
    />,
  );
  expect(screen.getByRole("button", { name: /refresh now/i })).toHaveAttribute(
    "data-variant",
    "outline",
  );
});

it("formats a 7 day cache window as days", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
  try {
    render(
      <DomainOverviewContextBar
        dateFormat="month_first"
        report={{
          ...domainOverviewReportFixture,
          cachedUntil: "2026-08-19T10:00:00.000Z",
        }}
      />,
    );
    expect(screen.getByText("cached, free for 7 days")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
