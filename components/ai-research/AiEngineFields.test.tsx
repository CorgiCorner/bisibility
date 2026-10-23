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
  it("defaults to Engines with chat_gpt and leaves model fields at their defaults", async () => {
    const analyze = renderPrompt();
    expect(screen.getByRole("radio", { name: "enginesMode" })).toBeChecked();
    expect(screen.getByRole("button", { name: "engineChatGpt gpt-4.1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "engineClaude claude-sonnet-5" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("claude-sonnet-5")).toBeVisible();
    expect(screen.getByText("engineModeHint")).toBeVisible();
    expect(screen.queryByRole("button", { name: "firstModel" })).toBeNull();
    expect(screen.queryByLabelText("outputTokens")).toBeNull();
    expect(screen.queryByRole("button", { name: "costPolicy" })).toBeNull();
    const payload = await submit(analyze);
    expect(payload.engines).toEqual(["chat_gpt"]);
    expect(payload.cost_policy).toBe("hard_cap");
    // The server schema accepts only these untouched defaults alongside engines.
    expect(payload).toMatchObject({ models: [...LEGACY_MODELS], max_output_tokens: 512 });
  });
  it("keeps at least one engine selected", () => {
    renderPrompt();
    const chat = screen.getByRole("button", { name: "engineChatGpt gpt-4.1" });
    // The last selected chip stays enabled so it reads as selected; deselecting it is ignored.
    expect(chat).toBeEnabled();
    fireEvent.click(chat);
    expect(chat).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "engineClaude claude-sonnet-5" }));
    expect(chat).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chat);
    expect(chat).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "engineClaude claude-sonnet-5" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("restores the legacy model defaults when switching back to Models", async () => {
    const analyze = renderPrompt();
    fireEvent.click(screen.getByRole("radio", { name: "modelsMode" }));
    expect(screen.getByRole("radio", { name: "modelsMode" })).toBeChecked();
    expect(screen.getByRole("button", { name: "firstModel" })).toHaveTextContent("GPT-4.1 mini");
    expect(screen.getByLabelText("outputTokens")).toHaveValue(512);
    expect(screen.getByRole("button", { name: "costPolicy" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "engineChatGpt gpt-4.1" })).toBeNull();
    const payload = await submit(analyze);
    expect(payload.models).toEqual(["gpt-4.1-mini", "gpt-4.1-nano"]);
    expect(payload.max_output_tokens).toBe(512);
    expect(payload).not.toHaveProperty("engines");
  });
  it("renders nothing and keeps today's model fields when no engines are offered", async () => {
    const analyze = renderPrompt([]);
    expect(screen.queryByRole("radio", { name: "enginesMode" })).toBeNull();
    expect(screen.queryByText("engineModeHint")).toBeNull();
    expect(screen.getByRole("button", { name: "firstModel" })).toBeVisible();
    expect(screen.getByLabelText("outputTokens")).toHaveValue(512);
    expect(screen.getByRole("button", { name: "costPolicy" })).toBeVisible();
    const payload = await submit(analyze);
    expect(payload.models).toEqual(["gpt-4.1-mini", "gpt-4.1-nano"]);
    expect(payload.max_output_tokens).toBe(512);
    expect(payload).not.toHaveProperty("engines");
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
    expect(screen.getByText("engineClaude · claude-sonnet-5")).toBeVisible();
  });
});
