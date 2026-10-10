import messages from "@/messages/core/en/project-ai-research.json";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () =>
    (key: keyof typeof messages.projectAiResearch, values?: Record<string, string | number>) =>
      (messages.projectAiResearch[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) =>
        String(values?.[name] ?? name),
      ),
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
      }}
    />,
  );
  expect(screen.getByText("7.32 cents confirmed usage")).toBeVisible();
  expect(screen.queryByText("0.00 cents confirmed usage")).toBeNull();
  expect(screen.getByText(messages.projectAiResearch.partialFailure)).toBeVisible();
  expect(screen.getByRole("link", { name: "Open saved report" })).toHaveAttribute(
    "href",
    "/app/prj_example/agent-reports/agr_saved",
  );
});

it("shows unknown total usage on a zero-answer failure without claiming a free request", () => {
  render(<AiResearchResults result={{ ...failedResult, costCents: 0, costStatus: "unknown" }} />);
  expect(screen.getByText("0.00 cents confirmed subtotal; total usage unknown")).toBeVisible();
  expect(screen.queryByText("0.00 cents confirmed usage")).toBeNull();
  expect(screen.queryByText(messages.projectAiResearch.noObservations)).toBeNull();
});

it("retains measured cost for a reconciled empty result", () => {
  render(<AiResearchResults result={{ ...failedResult, failure: null, truncated: false }} />);
  expect(screen.getByText("7.32 cents confirmed usage")).toBeVisible();
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
