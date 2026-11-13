import { aiResearchCatalogFixture } from "@/components/ai-research/ai-research-fixtures";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPlayground } from "./ModelPlayground";

vi.mock("@/lib/actions/ai-research", () => ({
  analyzeAiResearchAction: vi.fn(),
  getAiResearchCatalogAction: vi.fn(),
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("@/lib/actions/research-history", () => ({
  loadModelPlaygroundHistoryAction: vi.fn(async () => ({
    ok: true,
    page: { chips: [], groups: [], nextCursor: null, pinnedCount: 0, timeZone: "UTC", total: 0 },
  })),
}));
vi.mock("@/lib/actions/research-history-pins", () => ({
  pinResearchHistoryAction: vi.fn(),
  unpinResearchHistoryAction: vi.fn(),
}));

const messages = { ...sharedMessages, ...aiMessages, ...trackingMessages, ...historyMessages };
const base = {
  canRun: true,
  domain: "acme.example.com",
  entities: [],
  projectId: "prj_example",
  projectName: "Acme",
  sourceOverrides: [],
  topics: [],
};

describe("Model Playground composer limits", () => {
  it("keeps the lead in the header only and asks to connect a provider when no models are loaded", () => {
    renderWithFeatureMessages(
      <ModelPlayground {...base} catalogFailure="no_source" engineOptions={[]} />,
      { messages },
    );
    expect(
      screen.queryByText(aiMessages.projectAiResearch.modelPlayground.lead),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(aiMessages.projectAiResearch.modelPlayground.payWithPending),
    ).not.toBeInTheDocument();
    expect(screen.getByText(sharedMessages.shared.providerAccess.connect)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: sharedMessages.shared.providerAccess.action });
    expect(link).toHaveAttribute("href", "/app/prj_example/providers");
    expect(link.closest("fieldset")).toBeNull();
    const prompt = screen.getByRole("textbox", { name: /Your question/ });
    const promptRow = prompt.closest("[data-composer-row='prompt']");
    const controls = document.querySelector<HTMLElement>("[data-composer-row='controls']");
    expect(promptRow).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(promptRow).not.toContainElement(controls);
    expect(prompt).toBeDisabled();
    expect(controls).toHaveClass("grid", "sm:grid-cols-2");
    expect(screen.getByText("Web search")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Let the AI search the web" });
    expect(toggle.closest("label")).not.toHaveTextContent("connect your own DataForSEO key");
    const setup = screen.getByRole("link", { name: "Set it up in Advanced." });
    expect(setup).toHaveAttribute("href", "/app/prj_example/settings/advanced");
    const footer = screen.getByRole("button", { name: "Run" }).parentElement;
    expect(footer).toHaveClass("border-t", "col-span-full");
    expect(footer?.parentElement?.tagName).toBe("FORM");
    const details = document.querySelector("[data-composer-row='details']");
    expect(details).toHaveClass("col-span-full");
    expect(details?.nextElementSibling).toBe(footer);
    expect(details).toContainElement(
      screen.getByRole("spinbutton", { name: "Spending limit (USD)" }),
    );
    const fields = controls?.querySelectorAll("[data-form-field]");
    expect(fields).toHaveLength(2);
    fields?.forEach((field) => {
      expect(field.firstElementChild).toHaveClass("h-5");
    });
    expect(toggle.closest("label")).toHaveClass("border-0", "p-0");
    expect(toggle.closest("label")?.parentElement).toHaveClass("h-10");
    expect(screen.queryByText(/Same prompt/)).not.toBeInTheDocument();
    expect(screen.queryByText(aiMessages.projectAiResearch.noSource)).not.toBeInTheDocument();
  });

  it("keeps at most the calibrated engines and cannot clear the last one", async () => {
    const user = userEvent.setup();
    renderWithFeatureMessages(
      <ModelPlayground
        {...base}
        catalog={aiResearchCatalogFixture}
        engineOptions={[
          { engine: "chat_gpt", model: "gpt-4.1-mini" },
          { engine: "claude", model: "claude-example" },
          { engine: "gemini", model: "gemini-example" },
          { engine: "perplexity", model: "perplexity-example" },
        ]}
      />,
      { messages },
    );
    expect(screen.getByText("Choose up to 4 engines per check.")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    const chat = screen.getByRole("checkbox", { name: "ChatGPT" });
    expect(chat).toBeChecked();
    await user.click(chat);
    expect(chat).toBeChecked();
  });

  it("shows the two-model limit when engine mode is unavailable", () => {
    const catalog: AiResearchCatalog = {
      ...aiResearchCatalogFixture,
      models: [
        ...aiResearchCatalogFixture.models.filter((model) => model.priceAvailable),
        {
          ...aiResearchCatalogFixture.models[0],
          id: "gpt-example",
          label: "Example model",
        },
      ],
    };
    renderWithFeatureMessages(<ModelPlayground {...base} catalog={catalog} engineOptions={[]} />, {
      messages,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Compare up to 2 models per check.");
    expect(screen.getByRole("checkbox", { name: "Example model" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "GPT-4.1 mini" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("renders one column per engine from the saved result", () => {
    renderWithFeatureMessages(
      <ModelPlayground
        {...base}
        canTrack
        catalog={aiResearchCatalogFixture}
        engineOptions={[
          { engine: "chat_gpt", model: "gpt-4.1-mini" },
          { engine: "claude", model: "claude-example" },
          { engine: "gemini", model: "gemini-example" },
        ]}
        entities={[
          {
            aliases: [],
            domain: "acme.example.com",
            excludedNames: [],
            id: "project",
            kind: "project",
            label: "Acme",
          },
          {
            aliases: [],
            domain: "northwind.example.org",
            excludedNames: [],
            id: "competitor",
            kind: "competitor",
            label: "Northwind",
          },
        ]}
        initialOutcome={{
          cached: false,
          costCents: 12,
          estimate: false,
          ok: true,
          reportId: "agr_abcdefghijklmnopqrstuvwx",
          result: {
            costCents: 12,
            costStatus: "confirmed",
            evidence: "synthetic_prompt_test",
            failure: "Gemini did not answer.",
            fetchedAt: "2026-11-10T12:00:02Z",
            rows: [
              {
                answer: "Acme is the first place to look.",
                brandMentioned: true,
                citations: [
                  { targetDomain: true, title: "Acme docs", url: "https://acme.example.com/docs" },
                ],
                domainCited: true,
                engine: "chat_gpt",
                model: "gpt-4.1-mini",
                observedAt: "2026-11-10T12:00:00Z",
                prompt: "Which directory should a team start with?",
              },
              {
                answer: "Northwind publishes a directory.",
                brandMentioned: false,
                citations: [],
                domainCited: false,
                engine: "claude",
                model: "claude-example",
                observedAt: "2026-11-10T12:00:01Z",
                prompt: "Which directory should a team start with?",
              },
            ],
            totalAvailable: null,
            truncated: true,
          },
        }}
        selectedEngines={["chat_gpt", "claude", "gemini"]}
      />,
      { messages },
    );
    expect(screen.getByText("You are named #1 and cited")).toBeInTheDocument();
    expect(screen.getByText("You are not named")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The analysis could not be completed. Confirmed results are retained. Review provider usage before retrying.",
      ),
    ).toBeInTheDocument();
  });
});

it("refreshes provider access from server props while retaining the local composer", () => {
  const props = {
    ...base,
    catalog: aiResearchCatalogFixture,
    engineOptions: [{ engine: "chat_gpt" as const, model: "gpt-example" }],
  };
  const { rerender } = renderWithFeatureMessages(<ModelPlayground {...props} canRun={false} />, {
    messages,
  });
  expect(screen.getByRole("textbox", { name: /Your question/ })).toBeDisabled();
  rerender(<ModelPlayground {...props} canRun />);
  expect(screen.getByRole("textbox", { name: /Your question/ })).toBeEnabled();
  rerender(<ModelPlayground {...props} canRun={false} />);
  expect(screen.getByRole("textbox", { name: /Your question/ })).toBeDisabled();
});
