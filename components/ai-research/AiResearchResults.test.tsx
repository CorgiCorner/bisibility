import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import messages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) =>
    (
      (namespace === "shared.actionPayment"
        ? (sharedMessages.shared.actionPayment as Record<string, string>)
        : (messages.projectAiResearch as Record<string, string>))[key] ?? key
    ).replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? name)),
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchResults } from "./AiResearchResults";
import { AiResearchWorkspace } from "./AiResearchWorkspace";

const failedResult = {
  evidence: "synthetic_prompt_test" as const,
  rows: [],
  totalAvailable: null,
  truncated: true,
  fetchedAt: "2026-10-06",
  costCents: 7.32,
  costStatus: "confirmed" as const,
  failure: "Provider charged but returned no answers",
};
const quote = paymentQuote({
  charge: { value: "0.0732", certainty: "measured", unit: { kind: "currency", code: "USD" } },
});
const chargedReceipt = {
  actionId: "original",
  quoteId: quote.id,
  option: quote.option,
  state: "settled" as const,
  charge: quote.charge,
};

it("shows the charged receipt on a failed no-answer report, including a replay with zero additional charge", () => {
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      initialOutcome={{
        ok: true,
        estimate: false,
        cached: true,
        reportId: "agr_saved",
        costCents: 0,
        result: failedResult,
        payment: {
          ...chargedReceipt,
          actionId: "cached-replay",
          state: "free",
          charge: { ...chargedReceipt.charge, value: "0", certainty: "free" },
        },
        originalPayment: chargedReceipt,
      }}
    />,
  );
  expect(screen.getByText("Original lookup:").parentElement).toHaveTextContent("$0.0732");
  expect(screen.getByText("$0.00")).toBeVisible();
  expect(screen.getByText(messages.projectAiResearch.partialFailure)).toBeVisible();
  expect(screen.getByRole("link", { name: "Open saved report" })).toHaveAttribute(
    "href",
    "/app/prj_example/agent-reports/agr_saved",
  );
});

it("shows unknown total usage on a zero-answer failure without claiming a free request", () => {
  render(
    <AiResearchResults
      result={{ ...failedResult, costCents: 0, costStatus: "unknown" }}
      payment={{
        ...chargedReceipt,
        state: "unknown",
        charge: { ...chargedReceipt.charge, value: null, certainty: "unknown" },
      }}
    />,
  );
  expect(screen.getByText("Charge not confirmed")).toBeVisible();
  expect(screen.queryByText("$0.00")).toBeNull();
  expect(screen.queryByText(messages.projectAiResearch.noObservations)).toBeNull();
});

it("retains measured cost for a reconciled empty result", () => {
  render(
    <AiResearchResults
      result={{ ...failedResult, failure: null, truncated: false }}
      payment={chargedReceipt}
    />,
  );
  expect(screen.getByText("$0.0732")).toBeVisible();
  expect(screen.getByText(messages.projectAiResearch.noObservations)).toBeVisible();
});

it("discloses an unknown actual model separately from the requested model", () => {
  render(
    <AiResearchResults
      result={{
        ...failedResult,
        rows: [
          {
            prompt: "q",
            model: "unknown",
            requestedModel: "gpt-4.1-mini",
            actualModel: null,
            answer: "answer",
            observedAt: null,
            brandMentioned: false,
            domainCited: false,
            citations: [],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText(/Requested model: gpt-4.1-mini/)).toBeVisible();
  expect(screen.getByText(/Actual model: Unknown model/)).toBeVisible();
});
