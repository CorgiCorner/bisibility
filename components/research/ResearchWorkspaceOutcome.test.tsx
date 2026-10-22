import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { researchScopeForLocationKey } from "@/lib/research/scope";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ResearchWorkspaceOutcome } from "./ResearchWorkspaceOutcome";
import type { UiResearchOutcome } from "./research-workspace-model";
import { useResearchWorkspaceCopy } from "./useResearchWorkspaceCopy";

function Fixture({ outcome }: { outcome: UiResearchOutcome }) {
  const scope = researchScopeForLocationKey("US");
  const copy = useResearchWorkspaceCopy("UTC");
  return (
    <ResearchWorkspaceOutcome
      activeTab={{
        id: "tab",
        includeClickstream: false,
        scope,
        mode: "related",
        outcome,
        requestedLimit: 100,
        seed: "seed",
      }}
      researching={false}
      projectId="prj_example"
      scope={scope}
      researchAvailable
      budgetState={null}
      copy={copy}
      onRetry={vi.fn()}
    />
  );
}

it.each([
  { ok: false as const, reason: "payment_already_executed" as const },
  { ok: false as const, reason: "lookup_failed" as const, charged: null },
])("does not offer a new paid retry when execution or charge status is unresolved", (outcome) => {
  render(<Fixture outcome={outcome} />);
  expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Charge not confirmed");
  expect(screen.queryByText("You were not charged.")).not.toBeInTheDocument();
});

it("shows retained charges on a failed action without claiming it was free", () => {
  const quote = paymentQuote();
  render(
    <Fixture
      outcome={{
        ok: false,
        reason: "provider_error",
        payment: {
          actionId: "failed",
          quoteId: quote.id,
          option: quote.option,
          state: "settled",
          charge: { ...quote.charge, certainty: "measured" },
        },
      }}
    />,
  );
  expect(screen.getByText("4 tokens")).toBeInTheDocument();
  expect(screen.queryByText("You were not charged.")).not.toBeInTheDocument();
});

it("does not offer a new paid retry for a retained pending charge", () => {
  const quote = paymentQuote();
  render(
    <Fixture
      outcome={{
        ok: false,
        reason: "provider_error",
        payment: {
          actionId: "failed",
          quoteId: quote.id,
          option: quote.option,
          state: "pending",
          charge: { ...quote.charge, value: null, certainty: "unknown" },
        },
      }}
    />,
  );
  expect(screen.getByText("Charge pending")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
});
