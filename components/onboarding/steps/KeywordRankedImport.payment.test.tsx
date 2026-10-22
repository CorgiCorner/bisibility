import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { renderWithOnboardingMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { expect, it, vi } from "vitest";
import { KeywordRankedImport } from "./KeywordRankedImport";
import { rankedImportMessages } from "./keyword-import-messages";
import type { FetchRankedKeywordSuggestionsAction } from "./keyword-ranked-model";

vi.mock("@/components/action-payment/ActionPaymentPrice", () => ({
  ActionPaymentPrice: () => null,
}));
vi.mock("@/lib/actions/action-payment", () => ({
  assessActionPaymentsAction: async () => ({ allowed: true, reason: null, charges: [] }),
}));

const unit = { kind: "credits", key: "credits", singular: "credit", plural: "credits" } as const;
const quote = paymentQuote({
  charge: { value: "3", unit, certainty: "estimate" },
  option: {
    id: "credits",
    providerId: "dataforseo",
    providerLabel: "DataForSEO",
    connectionId: "conn_a00000000000000000000000",
    fundingSource: "platform",
    payableUnit: unit,
  },
});
const page = {
  cached: false,
  connections: [{ id: quote.option.connectionId, label: "DataForSEO", provider: "dataforseo" }],
  costCents: 2,
  fetchedAt: "2026-10-21T12:00:00Z",
  offset: 0,
  totalCount: 0,
  rows: [],
};
function Harness({ action }: { action: FetchRankedKeywordSuggestionsAction }) {
  const t = useTranslations("onboarding.keywords");
  return (
    <KeywordRankedImport
      connections={page.connections}
      currentKeywords=""
      domain="example.com"
      fetchAction={action}
      messages={rankedImportMessages(t)}
      onAppendQueries={vi.fn()}
      projectId="project"
    />
  );
}

it("shows credits before the import and sends the displayed payer only after Start", async () => {
  const action = vi.fn<FetchRankedKeywordSuggestionsAction>(async (input) =>
    input.estimateOnly
      ? { ...page, estimate: true, payment: quote, paymentOptions: [quote.option] }
      : {
          ...page,
          payment: {
            actionId: "action",
            quoteId: quote.id,
            option: quote.option,
            state: "settled",
            charge: { value: "2", unit, certainty: "measured" },
          },
        },
  );
  render(<Harness action={action} />);
  fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
  const start = await screen.findByRole("button", { name: "Start" });
  expect(screen.getAllByText(/3 credits/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/\$0\.02/)).not.toBeInTheDocument();
  expect(action.mock.calls.every(([input]) => input.estimateOnly)).toBe(true);
  fireEvent.click(start);
  await waitFor(() =>
    expect(
      action.mock.calls.some(([input]) => input.acceptedPayment?.quoteToken === quote.quoteToken),
    ).toBe(true),
  );
  expect(action.mock.calls.at(-1)?.[0]).toMatchObject({
    offset: 0,
    paymentOptionId: "credits",
    acceptedPayment: { quoteToken: quote.quoteToken },
  });
  expect(await screen.findByText(/2 credits/)).toBeVisible();
});

it("keeps an unknown charge visible and blocks another paid import", async () => {
  const action = vi.fn<FetchRankedKeywordSuggestionsAction>(async (input) =>
    input.estimateOnly
      ? { ...page, estimate: true, payment: quote, paymentOptions: [quote.option] }
      : {
          reason: "provider_error",
          payment: {
            actionId: "action",
            quoteId: quote.id,
            option: quote.option,
            state: "unknown",
            charge: { value: null, unit, certainty: "unknown" },
          },
        },
  );
  render(<Harness action={action} />);
  fireEvent.click(screen.getByRole("button", { name: /Import from DataForSEO/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  expect(await screen.findByText("Charge not confirmed")).toBeVisible();
  expect(screen.getByRole("button", { name: /Import from DataForSEO/ })).toBeDisabled();
});
