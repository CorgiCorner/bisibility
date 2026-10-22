import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DomainOverviewAnalyzeCard } from "./DomainOverviewAnalyzeCard";
import { domainOverviewScopeFixture } from "./fixtures";

const props = {
  catalogScopes: [],
  trackedScopes: [],
  researchScope: domainOverviewScopeFixture,
  target: "example.com",
  submitting: false,
  onResearchScopeChange: vi.fn(),
  onScopeChange: vi.fn(),
  onSubmit: vi.fn(),
  onTargetChange: vi.fn(),
};
const estimate = {
  cached: false,
  costCents: 999,
  freshCostCents: 999,
  historyCostCents: 999,
  keywordPageCostCents: 999,
  pagePageCostCents: 999,
  loading: false,
  valid: true,
};

it("does not price an action from scalar provider-dollar estimates", () => {
  render(<DomainOverviewAnalyzeCard {...props} estimate={estimate} />);
  expect(screen.getByRole("button", { name: "Analyze domain" })).toBeEnabled();
  expect(screen.queryByText(/9.99/)).not.toBeInTheDocument();
});

it("shows an unknown provider's supplied native unit on the action", () => {
  render(
    <DomainOverviewAnalyzeCard {...props} estimate={{ ...estimate, payment: paymentQuote() }} />,
  );
  expect(screen.getByRole("button", { name: "Analyze domain ≈ 4 tokens" })).toBeEnabled();
  expect(screen.queryByText(/9.99/)).not.toBeInTheDocument();
});

it("rounds the action label to the project display precision and titles the exact amount", () => {
  const quote = paymentQuote({
    charge: {
      certainty: "estimate",
      unit: { kind: "credits", key: "bisibility", plural: "Credits", singular: "Credit" },
      value: "9.8889",
    },
  });
  render(<DomainOverviewAnalyzeCard {...props} estimate={{ ...estimate, payment: quote }} />);
  expect(screen.getByRole("button", { name: "Analyze domain ≈ 9.89 Credits" })).toHaveAttribute(
    "title",
    "≈ 9.8889 Credits",
  );
});
