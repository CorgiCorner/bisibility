import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import type { ModelMoney } from "@/lib/model-playground/types";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPlaygroundColumnFooter } from "./ModelPlaygroundColumnFooter";

const reported: ModelMoney = {
  amount: "0.00123456",
  currency: "USD",
  certainty: "reported",
  basis: "original_request_readback",
  rateCardVersion: null,
};
const render = (value = columnResult()) =>
  renderWithFeatureMessages(
    <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={vi.fn()} />,
    {
      messages: {
        ...sharedMessages,
        ...aiMessages,
        projectAiResearch: {
          ...aiMessages.projectAiResearch,
          modelPlayground: { ...aiMessages.projectAiResearch.modelPlayground },
        },
      },
    },
  );
describe("per-column usage and cost", () => {
  it("keeps unknown money and measured token dimensions independently", async () => {
    render();
    expect(screen.getByText("Cost unavailable · 150 tokens")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
    for (const label of [
      "Input tokens",
      "Output tokens",
      "Reasoning tokens (within output)",
      "Cache read tokens",
      "Cache write tokens",
      "Search calls",
      "Search content tokens",
      "Input cache accounting",
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });
  it("marks estimates and their rate basis without rounding to zero", async () => {
    const value = columnResult();
    value.providerCost = {
      ...reported,
      certainty: "estimated",
      basis: "rate_card",
      rateCardVersion: "rates-v1",
    };
    render(value);
    expect(screen.getByText(/~\$0.00123456 estimated from usage/)).toBeInTheDocument();
    expect(screen.queryByText(/reported by provider/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
    expect(screen.getByText("rate_card")).toBeInTheDocument();
    expect(screen.getByText("rates-v1")).toBeInTheDocument();
  });
  it("keeps provider-reported money distinct from estimates and unknown scope", async () => {
    const value = columnResult();
    value.providerCost = reported;
    render(value);
    expect(screen.getByText(/\$0.00123456 reported by provider/)).toBeInTheDocument();
    expect(screen.getByText("Cost scope unknown")).toBeInTheDocument();
    expect(screen.queryByText(/estimated from usage/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
    expect(screen.getByText("original_request_readback")).toBeInTheDocument();
  });
  it("never calls a subtotal a total and retains missing components", async () => {
    const value = columnResult();
    value.costEvidence = {
      providerReported: {
        money: reported,
        scope: {
          kind: "subtotal",
          includes: ["inference"],
          excludes: ["tools"],
          unknown: ["routing", "reporting_writes", "zero_data_retention", "other"],
        },
      },
      localEstimate: null,
      upstreamInference: null,
    };
    render(value);
    expect(screen.getByText(/Subtotal \$0.00123456/)).toBeInTheDocument();
    expect(screen.queryByText(/^Total \$/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
    expect(screen.getByText("tools")).toBeInTheDocument();
    expect(screen.getByText(/routing, reporting_writes/)).toBeInTheDocument();
  });
  it("R6 keeps its controlled region mounted while collapsed", async () => {
    render();
    const button = screen.getByRole("button", { name: "Usage and cost details" });
    const region = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("hidden");
    await userEvent.click(button);
    expect(region).not.toHaveAttribute("hidden");
  });
  it("R8 totals input 100 and output 50 without adding subsets 20 and 10", () => {
    render();
    const summary = document.querySelector("[data-column-cost]")?.textContent;
    expect(summary).toMatch(/^Cost unavailable · 150 tokens$/);
    expect(summary).not.toMatch(/170 tokens|180 tokens/);
  });
  it("does not invent zero or double-count cache and reasoning subsets", () => {
    const value = columnResult();
    value.usage.inputTokens = null;
    value.usage.outputTokens = null;
    value.usage.completeness = "partial";
    render(value);
    expect(screen.getByText("Cost unavailable · Token total unknown")).toBeInTheDocument();
    expect(screen.queryByText(/0 tokens/)).not.toBeInTheDocument();
  });
});

it("keeps the original payment source in the expanded details", async () => {
  const value = columnResult();
  value.column.payment = { optionId: "platform:openai", fundingSource: "platform" };
  render(value);
  expect(screen.getByText("Cost unavailable · 150 tokens")).toBeInTheDocument();
  const funding = screen.getByText("Credits");
  expect(funding).not.toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usage and cost details" }));
  expect(funding).toBeVisible();
});

it("adds separately reported cache tokens once and keeps reasoning inside output", () => {
  const value = columnResult();
  value.usage.inputCacheAccounting = "additional";
  value.usage.inputTokens = 100;
  value.usage.outputTokens = 50;
  value.usage.cacheReadInputTokens = 20;
  value.usage.cacheWriteInputTokens = 10;
  value.usage.reasoningTokens = 5;
  render(value);
  expect(screen.getByText("Cost unavailable · 180 tokens")).toBeInTheDocument();
});
it("does not invent an additional cache count", () => {
  const value = columnResult();
  value.usage.inputCacheAccounting = "additional";
  value.usage.cacheReadInputTokens = null;
  render(value);
  expect(screen.getByText("Cost unavailable · Token total unknown")).toBeInTheDocument();
});
