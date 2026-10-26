import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { LEGACY_MODELS } from "@/lib/ai-research/legacy";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: unknown) => String(value) }),
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import type { AiEngineOption } from "./AiEngineFields";
import { AiResearchResults } from "./AiResearchResults";
import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

const engineOptions = [
  { engine: "chat_gpt", model: "gpt-4.1" },
  { engine: "claude", model: "claude-sonnet-5" },
] as const satisfies readonly AiEngineOption[];

function renderPrompt(options: readonly AiEngineOption[] = engineOptions) {
  const analyze = vi.fn().mockResolvedValue({
    ok: false,
    reason: "pricing_unavailable",
    message: "Pricing unavailable",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="example.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      engineOptions={options}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Example" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Which tools help small businesses?" },
  });
  return analyze;
}
async function submit(analyze: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(analyze).toHaveBeenCalled());
  return analyze.mock.calls.at(-1)?.[2] as Record<string, unknown>;
}

describe("prompt engine picker", () => {
  it("defaults to ChatGPT with models secondary and advanced controls collapsed", async () => {
    const analyze = renderPrompt();
    expect(screen.getByRole("checkbox", { name: "ChatGPT" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Claude" })).not.toBeChecked();
    expect(screen.getByText("claude-sonnet-5")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Gemini" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Gemini" })).toHaveAccessibleDescription(
      "engineUnavailable",
    );
    expect(screen.getByText("engineModeHint")).toBeVisible();
    expect(screen.queryByRole("button", { name: "firstModel" })).toBeNull();
    expect(screen.queryByLabelText("outputTokens")).toBeNull();
    expect(screen.queryByRole("button", { name: "costPolicy" })).toBeNull();
    const payload = await submit(analyze);
    expect(payload.engines).toEqual(["chat_gpt"]);
    expect(payload.cost_policy).toBe("hard_cap");
    expect(payload).toMatchObject({ models: [...LEGACY_MODELS], max_output_tokens: 512 });
  });
  it("keeps at least one engine and sends the chosen engines in the estimate", async () => {
    const analyze = renderPrompt();
    const chat = screen.getByRole("checkbox", { name: "ChatGPT" });
    fireEvent.click(chat);
    expect(chat).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Claude" }));
    fireEvent.click(chat);
    expect(chat).not.toBeChecked();
    expect((await submit(analyze)).engines).toEqual(["claude"]);
  });
  it("keeps model mode inside Advanced and restores its server defaults", async () => {
    const analyze = renderPrompt();
    fireEvent.click(screen.getByText("advanced"));
    fireEvent.click(screen.getByRole("button", { name: "chooseModels" }));
    expect(screen.getByRole("button", { name: "firstModel" })).toHaveTextContent("GPT-4.1 mini");
    expect(screen.getByLabelText("outputTokens")).toHaveValue(512);
    expect(screen.getByRole("button", { name: "costPolicy" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "ChatGPT" })).toBeNull();
    const payload = await submit(analyze);
    expect(payload.models).toEqual(["gpt-4.1-mini", "gpt-4.1-nano"]);
    expect(payload).not.toHaveProperty("engines");
    fireEvent.click(await screen.findByRole("button", { name: "cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "useEngines" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "useEngines" }));
    expect(screen.getByRole("checkbox", { name: "ChatGPT" })).toBeChecked();
  });
  it("shows the selected fallback models and keeps advanced token controls collapsed", async () => {
    const analyze = renderPrompt([]);
    expect(screen.queryByRole("checkbox", { name: "ChatGPT" })).toBeNull();
    expect(screen.getByText("quickCheck")).toBeVisible();
    expect(screen.getByRole("button", { name: "firstModel" })).toBeVisible();
    expect(screen.getByLabelText("outputTokens")).not.toBeVisible();
    const payload = await submit(analyze);
    expect(payload.models).toEqual(["gpt-4.1-mini", "gpt-4.1-nano"]);
    expect(payload).not.toHaveProperty("engines");
  });
  it("shows the source gate without a usable fallback form when no source exists", () => {
    const { container } = render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="example.com"
        mode="prompt"
        history={[]}
        catalogFailure="no_source"
        supportingProviders={["DataForSEO"]}
      />,
    );
    expect(container.querySelector("[data-provider-locked]")).toBeInTheDocument();
    expect(screen.queryByLabelText("prompt")).toBeNull();
    expect(screen.queryByText("quickCheck")).toBeNull();
    expect(screen.queryByRole("button", { name: "estimateCost" })).toBeNull();
  });
  it("refreshes an existing estimate after engine selection and converts USD to request cents", async () => {
    const analyze = vi.fn().mockResolvedValue({
      ok: true,
      estimate: true,
      evidence: "synthetic_prompt_test",
      estimatedCostCents: 1,
      pricingPolicy: "measured_engines",
      payment: paymentQuote({
        charge: {
          value: "1",
          certainty: "estimate",
          unit: { kind: "credits", key: "credits", singular: "Credit", plural: "Credits" },
        },
      }),
    });
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="example.com"
        mode="prompt"
        history={[]}
        engineOptions={engineOptions}
        catalog={aiResearchCatalogFixture}
        analyzeAction={analyze}
      />,
    );
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Example" } });
    fireEvent.change(screen.getByLabelText("prompt"), { target: { value: "Which tools?" } });
    fireEvent.click(screen.getByText("advanced"));
    expect(screen.getByLabelText("costCap")).toHaveValue(0.6);
    fireEvent.change(screen.getByLabelText("costCap"), { target: { value: "0.75" } });
    await submit(analyze);
    expect(analyze.mock.calls[0][2].max_cost_cents).toBe(75);
    await waitFor(() => expect(screen.getByRole("button", { name: /^runAnalysis/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Claude" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(analyze.mock.calls[1][2]).toMatchObject({
      engines: ["chat_gpt", "claude"],
      estimate_only: true,
      max_cost_cents: 75,
    });
  });
  it("shows the engine label before the model on a result row", () => {
    render(
      <AiResearchResults
        result={{
          evidence: "synthetic_prompt_test",
          rows: [
            {
              prompt: "Which tools help?",
              model: "claude-sonnet-5",
              engine: "claude",
              answer: "Answer",
              observedAt: null,
              brandMentioned: false,
              domainCited: false,
              citations: [],
            },
          ],
          totalAvailable: 1,
          truncated: false,
          fetchedAt: "2026-10-22",
          costCents: 1,
          costStatus: "confirmed",
          failure: null,
        }}
      />,
    );
    expect(screen.getByText("Claude · claude-sonnet-5")).toBeVisible();
  });
});
