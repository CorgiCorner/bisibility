import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BacklinksResults } from "./BacklinksResults";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

it("separates this free cache read from the original saved charge", () => {
  const quote = paymentQuote();
  const originalPayment = {
    actionId: "original",
    quoteId: quote.id,
    option: quote.option,
    state: "settled" as const,
    charge: { ...quote.charge, certainty: "measured" as const },
  };
  const payment = {
    ...originalPayment,
    actionId: "cached-read",
    state: "free" as const,
    charge: { ...quote.charge, value: "0", certainty: "free" as const },
  };
  render(
    <BacklinksResults
      estimateCents={999}
      snapshot={{ ...backlinksSnapshotFixture, payment, originalPayment }}
    />,
  );
  expect(screen.getByText("0 tokens")).toBeInTheDocument();
  expect(screen.getByText("4 tokens")).toBeInTheDocument();
  expect(screen.getByText("Original lookup:")).toBeInTheDocument();
  expect(screen.queryByText(/9.99/)).not.toBeInTheDocument();
});
