import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiVisibilityOverviewFilters } from "./AiVisibilityOverviewFilters";
import { AiVisibilityPromptsShell } from "./AiVisibilityPromptsShell";
import { trackingFixtureActions, trackingWorkspaceFixture } from "./fixtures";
import {
  promptsAnswerPanel,
  promptsModel,
  promptsOtherId,
  promptsPromptId,
  promptsRows,
} from "./prompts-fixtures";

const messages = { ...shared, ...tracking };

it("updates URL filters from new server props", () => {
  const model = promptsModel();
  const props = {
    engines: ["chat_gpt", "gemini"],
    filters: model.filters,
    markets: [],
    onFilter: () => undefined,
    topics: [],
  };
  const { rerender } = renderWithFeatureMessages(<AiVisibilityOverviewFilters {...props} />, {
    messages,
  });
  rerender(
    <AiVisibilityOverviewFilters
      {...props}
      filters={{ ...model.filters, engine: "gemini", period: "7d", promptKind: "branded" }}
    />,
  );
  expect(screen.getByRole("button", { name: "All engines" })).toHaveTextContent("Gemini");
  expect(screen.getByRole("button", { name: "Period" })).toHaveTextContent("7");
  rerender(<AiVisibilityOverviewFilters {...props} />);
  expect(screen.getByRole("button", { name: "All engines" })).toHaveTextContent("All engines");
});

it("refreshes tracker rows and the prompt answer panel on same-route navigation", () => {
  setNavigationState({
    pathname: "/app/prj_example/ai-visibility",
    searchParams: { tab: "prompts" },
  });
  const model = promptsModel();
  const data = {
    ...trackingWorkspaceFixture,
    domain: "example.com",
    prompts: [
      { ...trackingWorkspaceFixture.prompts[0], id: promptsPromptId, text: promptsRows()[0].text },
    ],
  };
  const props = {
    actions: trackingFixtureActions,
    enginePrices: EMPTY_TRACKING_ENGINE_PRICES,
    initialData: data,
    model: { ...model, panel: null },
    projectId: "prj_example",
  };
  const { rerender } = renderWithFeatureMessages(<AiVisibilityPromptsShell {...props} />, {
    messages,
  });
  expect(screen.queryByRole("heading", { name: data.prompts[0].text })).not.toBeInTheDocument();
  const nextText = "Which documentation tools work?";
  const nextData = { ...data, prompts: [{ ...data.prompts[0], text: nextText }] };
  setNavigationState({
    pathname: "/app/prj_example/ai-visibility",
    searchParams: { tab: "prompts", prompt: promptsPromptId },
  });
  rerender(
    <AiVisibilityPromptsShell
      {...props}
      initialData={nextData}
      model={{
        ...model,
        rows: [{ ...model.rows[0], text: nextText }],
        panel: { ...promptsAnswerPanel(false), text: nextText },
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: nextText })).toBeInTheDocument();
  expect(screen.queryByText(data.prompts[0].text)).not.toBeInTheDocument();
  setNavigationState({
    pathname: "/app/prj_example/ai-visibility",
    searchParams: { tab: "prompts", prompt: promptsOtherId },
  });
  const otherText = "What about another topic?";
  rerender(
    <AiVisibilityPromptsShell
      {...props}
      initialData={{
        ...nextData,
        prompts: [{ ...nextData.prompts[0], id: promptsOtherId, text: otherText }],
      }}
      model={{
        ...model,
        rows: [{ ...model.rows[0], id: promptsOtherId, text: otherText }],
        panel: { ...promptsAnswerPanel(true), promptId: promptsOtherId, text: otherText },
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: otherText })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: nextText })).not.toBeInTheDocument();
  expect(screen.getByText(/No engine has answered this prompt yet/)).toBeInTheDocument();

  setNavigationState({
    pathname: "/app/prj_example/ai-visibility",
    searchParams: { tab: "prompts" },
  });
  rerender(<AiVisibilityPromptsShell {...props} />);
  expect(screen.queryByRole("heading", { name: nextText })).not.toBeInTheDocument();
  expect(screen.getByText(data.prompts[0].text)).toBeInTheDocument();
});
