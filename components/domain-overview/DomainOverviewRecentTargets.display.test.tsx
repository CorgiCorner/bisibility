import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DomainOverviewRecentTargets } from "./DomainOverviewRecentTargets";

it("rounds a retained lookup to the project display precision and titles the exact amount", () => {
  const quote = paymentQuote({
    charge: {
      certainty: "estimate",
      unit: { kind: "credits", key: "bisibility", plural: "Credits", singular: "Credit" },
      value: "9.8889",
    },
  });
  render(
    <DomainOverviewRecentTargets
      onOpen={() => undefined}
      targets={[
        {
          cachedUntil: "2026-08-13T12:00:00.000Z",
          fetchedAt: "2026-08-12T12:00:00.000Z",
          languageCode: "en",
          locationCode: 2840,
          originalPayment: {
            actionId: "original",
            charge: { ...quote.charge, certainty: "measured" },
            option: quote.option,
            quoteId: quote.id,
            state: "settled",
          },
          scope: "root",
          target: "example.org",
        },
      ]}
    />,
  );
  expect(screen.getByText("Original lookup:")).toBeInTheDocument();
  expect(screen.getByText("9.89 Credits")).toHaveAttribute("title", "9.8889 Credits");
});
