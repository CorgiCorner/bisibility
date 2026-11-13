import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilityPromptsTable } from "./AiVisibilityPromptsTable";
import { AiVisibilityPromptsView } from "./AiVisibilityPromptsView";
import {
  promptsFilters,
  promptsModel,
  promptsNorth,
  promptsOtherId,
  promptsOwn,
  promptsProjectId,
  promptsPromptId,
  promptsRows,
} from "./prompts-fixtures";

const messages = { ...shared, ...tracking };
const now = promptsModel().now;

afterEach(() => {
  cleanup();
});

it("groups prompts by topic and keeps the outcome columns", async () => {
  const onSelect = vi.fn();
  renderWithFeatureMessages(
    <AiVisibilityPromptsTable
      canWrite
      now={now}
      onSelect={onSelect}
      onSelectionChange={() => undefined}
      rows={promptsRows()}
      selectedId={promptsPromptId}
      selection={new Set()}
    />,
    { messages, timeZone: "UTC" },
  );
  expect(screen.getByText("Tools · 1 prompt")).toBeInTheDocument();
  expect(screen.getByText("No topic · 1 prompt")).toBeInTheDocument();
  expect(screen.getByText("Paused")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Leader" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Last run" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Revision" })).not.toBeInTheDocument();
  expect(screen.getByText("3 weeks ago")).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Prompts" });
  expect(table.className).toContain("overflow-x-auto");
  expect(table.className).not.toContain("overflow-hidden");
  const row = screen.getByRole("row", { name: /Which tools help a small team/ });
  expect(row).toHaveStyle({ height: "56px" });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("ChatGPT").closest("[data-engine]")).toHaveAttribute(
    "data-engine",
    "chat_gpt",
  );
  expect(screen.getByText("Gemini").closest("[data-engine]")).toHaveAttribute(
    "data-engine",
    "gemini",
  );
  await userEvent.click(screen.getByText("What is Acme?"));
  expect(onSelect).toHaveBeenCalledWith(promptsOtherId);
});

it("gives run history a button shape", () => {
  renderWithFeatureMessages(
    <AiVisibilityPromptsView
      activePromptCount={2}
      addHref="/app/prj_example/ai-visibility?tab=prompts&compose=prompt"
      canWrite
      domain={promptsOwn.domain}
      enginePrices={EMPTY_TRACKING_ENGINE_PRICES}
      engines={["chat_gpt", "gemini"]}
      entities={[promptsOwn, promptsNorth]}
      error={null}
      filters={promptsFilters}
      historyHref="/app/prj_example/ai-visibility?tab=prompts&view=runs"
      markets={[]}
      now={now}
      onAssignTopic={() => undefined}
      onBulk={() => undefined}
      onFilter={() => undefined}
      onOpenEvidence={() => undefined}
      onPromptAction={() => undefined}
      onRunPrompt={() => undefined}
      onSelect={() => undefined}
      onSelectionChange={() => undefined}
      panel={null}
      pending={false}
      projectId={promptsProjectId}
      rows={promptsRows()}
      runHref="/app/prj_example/ai-visibility?tab=prompts&compose=run"
      selectedId={null}
      selection={new Set()}
      topics={[]}
      truncated={false}
    />,
    { messages, timeZone: "UTC" },
  );
  const history = screen.getByRole("link", { name: "Run history" });
  expect(history).toHaveAttribute("data-variant", "outline");
  expect(history).toHaveAttribute("data-size", "sm");
});
