import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/actions/ai-research", () => ({ analyzeAiResearchAction: vi.fn() }));

import { AiResearchResults } from "./AiResearchResults";
import { AiResearchWorkspace } from "./AiResearchWorkspace";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

describe("AI workspace product states", () => {
  it("keeps saved reports readable and disables paid actions for read-only users", () => {
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="visibility"
        canRun={false}
        history={[{ id: "agr_example", title: "Saved report", createdAt: "2026-10-02" }]}
      />,
    );
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Saved report/ })).toHaveAttribute(
      "href",
      "/app/prj_example/agent-reports/agr_example",
    );
  });
  it("does not turn unknown-cost failed requests into a no-observations claim", () => {
    render(
      <AiResearchResults
        result={{
          evidence: "synthetic_prompt_test",
          rows: [],
          totalAvailable: null,
          truncated: true,
          failure: "unknown receipt",
          costStatus: "unknown",
          costCents: 0,
          fetchedAt: "2026-10-02",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("partialFailure");
    expect(screen.queryByText("noObservations")).toBeNull();
  });
});

describe("AI catalog and cost preflight", () => {
  function workspace(analyzeAction = vi.fn()) {
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="prompt"
        history={[]}
        catalog={aiResearchCatalogFixture}
        analyzeAction={analyzeAction}
      />,
    );
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("prompt"), {
      target: { value: "Which tools help small businesses?" },
    });
    return analyzeAction;
  }
  it("shows supported names rather than raw location codes", () => {
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="visibility"
        history={[]}
        catalog={aiResearchCatalogFixture}
      />,
    );
    expect(screen.getByRole("button", { name: "country" })).toHaveTextContent("United States");
    expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("English");
    expect(screen.queryByLabelText("locationCode")).toBeNull();
    expect(screen.queryByLabelText("languageCode")).toBeNull();
  });
  it("requires a current affordable estimate and invalidates it after edits", async () => {
    const analyze = workspace(
      vi.fn().mockResolvedValue({
        ok: true,
        estimate: true,
        estimatedCostCents: 12,
        evidence: "synthetic_prompt_test",
      }),
    );
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "runAnalysis" })).toBeEnabled());
    expect(analyze).toHaveBeenCalledWith(
      "prj_example",
      "prompt",
      expect.objectContaining({
        estimate_only: true,
        web_search: false,
        max_output_tokens: 512,
        response_language: "en",
      }),
    );
    fireEvent.change(screen.getByLabelText("outputTokens"), { target: { value: "2048" } });
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
  });
  it("blocks a run when the estimate exceeds the cap", async () => {
    workspace(
      vi.fn().mockResolvedValue({
        ok: true,
        estimate: true,
        estimatedCostCents: 61,
        evidence: "synthetic_prompt_test",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("estimateAboveCap"));
    expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
  });
  it("preserves saved reports when the provider catalog is unavailable", () => {
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="prompt"
        history={[{ id: "agr_saved", title: "Saved report", createdAt: "2026-10-06" }]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("catalogUnavailableLegacy");
    expect(screen.getByRole("button", { name: "estimateCost" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Saved report/ })).toBeVisible();
  });
  it("keeps web search unavailable even when provider capabilities support it", () => {
    workspace();
    expect(screen.getByRole("checkbox", { name: "webSearch" })).toBeDisabled();
    expect(screen.getByText("webSearchPolicyPending")).toBeVisible();
    expect(screen.queryByRole("button", { name: "searchCountry" })).toBeNull();
  });
});

it("keeps the approved legacy preset available when fresh model prices are missing", () => {
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={{
        ...aiResearchCatalogFixture,
        models: aiResearchCatalogFixture.models.map((model) => ({
          ...model,
          priceAvailable: false,
        })),
      }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("pricingUnavailableLegacy");
  expect(screen.getByRole("button", { name: "estimateCost" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
});

it("searches current model names and keeps unknown-price models unselectable", async () => {
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
    />,
  );
  const trigger = screen.getByRole("button", { name: "firstModel" });
  fireEvent.click(trigger);
  const search = screen.getByRole("textbox", { name: "searchPlaceholder" });
  fireEvent.change(search, { target: { value: "reasoning" } });
  expect(screen.queryByRole("menuitem", { name: "GPT-4.1 mini" })).toBeNull();
  const unavailable = screen.getByRole("menuitem", { name: /Reasoning example/ });
  expect(unavailable).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(unavailable);
  expect(trigger).toHaveTextContent("GPT-4.1 mini");
});

it("does not authorize changed settings from an estimate that finishes later", async () => {
  let finish: (value: {
    ok: true;
    estimate: true;
    estimatedCostCents: number;
    evidence: "synthetic_prompt_test";
  }) => void = () => {};
  const pending = new Promise<{
    ok: true;
    estimate: true;
    estimatedCostCents: number;
    evidence: "synthetic_prompt_test";
  }>((resolve) => {
    finish = resolve;
  });
  const analyze = vi.fn().mockReturnValue(pending);
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Which tools help small businesses?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(analyze).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Another brand" } });
  await act(async () =>
    finish({ ok: true, estimate: true, estimatedCostCents: 12, evidence: "synthetic_prompt_test" }),
  );
  expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
  expect(screen.getByText("estimateRequired")).toBeVisible();
});

it("explains missing verified pricing without enabling a paid run", async () => {
  const analyze = vi.fn().mockResolvedValue({
    ok: false,
    reason: "pricing_unavailable",
    message: "Pricing unavailable",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      analyzeAction={analyze}
    />,
  );
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByLabelText("prompt"), {
    target: { value: "Which tools help small businesses?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("pricingUnavailable"));
  expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
});

it.each([
  undefined,
  { ...aiResearchCatalogFixture, fetchedAt: "2026-01-01T00:00:00Z" },
  {
    ...aiResearchCatalogFixture,
    models: aiResearchCatalogFixture.models.map((model) => ({ ...model, priceAvailable: false })),
  },
])(
  "runs the original preset after a current server estimate during catalog outage %j",
  async (catalog) => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        estimate: true,
        estimatedCostCents: 52.6013,
        evidence: "synthetic_prompt_test",
        estimateKind: "admission_bound",
        isGuaranteedMaximum: false,
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: "fixture_stop",
        message: "No provider execution in fixture",
      });
    render(
      <AiResearchWorkspace
        projectId="prj_example"
        domain="acme.com"
        mode="prompt"
        history={[]}
        catalog={catalog}
        analyzeAction={analyze}
      />,
    );
    expect(screen.getByLabelText("outputTokens")).toHaveValue(512);
    expect(screen.getByLabelText("outputTokens")).toBeDisabled();
    expect(screen.getByRole("button", { name: "responseLanguage" })).toHaveTextContent(
      "legacyPromptLanguage",
    );
    expect(screen.getByRole("button", { name: "responseLanguage" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "webSearch" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "firstModel" })).toHaveTextContent("GPT-4.1 mini");
    expect(screen.getByRole("button", { name: "secondModel" })).toHaveTextContent("GPT-4.1 nano");
    fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("prompt"), {
      target: { value: "Jakie narzędzia pomagają małym firmom?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "runAnalysis" })).toBeEnabled());
    expect(screen.getByText("legacyAdmissionEstimate")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "runAnalysis" }));
    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(analyze).toHaveBeenLastCalledWith(
      "prj_example",
      "prompt",
      expect.objectContaining({
        estimate_only: false,
        models: ["gpt-4.1-mini", "gpt-4.1-nano"],
        max_output_tokens: 512,
        web_search: false,
        response_language: "en",
      }),
    );
    expect(analyze.mock.calls[1][2]).not.toHaveProperty("country_iso_code", expect.any(String));
  },
);

it("keeps the original observed market selectable and estimable during catalog outage", async () => {
  const analyze = vi.fn().mockResolvedValue({
    ok: true,
    estimate: true,
    estimatedCostCents: 11,
    evidence: "observed_dataset",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="visibility"
      history={[]}
      analyzeAction={analyze}
    />,
  );
  expect(screen.getByRole("button", { name: "country" })).toHaveTextContent("United States");
  expect(screen.getByRole("button", { name: "language" })).toHaveTextContent("English");
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "runAnalysis" })).toBeEnabled());
  expect(analyze).toHaveBeenCalledWith(
    "prj_example",
    "visibility",
    expect.objectContaining({
      platform: "chat_gpt",
      location_code: 2840,
      language_code: "en",
      estimate_only: true,
    }),
  );
});

it("requires fresh bounded metadata for extended output and invalidates legacy estimates on changes", async () => {
  const analyze = vi.fn().mockResolvedValue({
    ok: true,
    estimate: true,
    estimatedCostCents: 52.6013,
    evidence: "synthetic_prompt_test",
  });
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={aiResearchCatalogFixture}
      analyzeAction={analyze}
    />,
  );
  expect(screen.getByLabelText("outputTokens")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("brand"), { target: { value: "Acme" } });
  fireEvent.change(screen.getByLabelText("prompt"), { target: { value: "Which tools?" } });
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "runAnalysis" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("outputTokens"), { target: { value: "4096" } });
  expect(screen.getByRole("button", { name: "runAnalysis" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "estimateCost" }));
  await waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
  expect(analyze).toHaveBeenLastCalledWith(
    "prj_example",
    "prompt",
    expect.objectContaining({ max_output_tokens: 4096, estimate_only: true }),
  );
});

it("keeps priced snapshots disabled while policy approval is pending", () => {
  render(
    <AiResearchWorkspace
      projectId="prj_example"
      domain="acme.com"
      mode="prompt"
      history={[]}
      catalog={{
        ...aiResearchCatalogFixture,
        models: [
          ...aiResearchCatalogFixture.models,
          {
            ...aiResearchCatalogFixture.models[0],
            id: "gpt-4.1-mini-2025-04-14",
            label: "Mini snapshot",
            priceAvailable: true,
            admissionEnabled: false,
          },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "firstModel" }));
  expect(screen.getByRole("menuitem", { name: "Mini snapshot" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
