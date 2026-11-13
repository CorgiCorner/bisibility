import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilityPromptPanel } from "./AiVisibilityPromptPanel";
import {
  promptsAnswerPanel,
  promptsModel,
  promptsNorth,
  promptsOwn,
  promptsPromptId,
} from "./prompts-fixtures";

const messages = { ...shared, ...tracking };

afterEach(() => {
  cleanup();
});

function panel(empty: boolean, onRun = vi.fn()) {
  return renderWithFeatureMessages(
    <AiVisibilityPromptPanel
      canWrite
      configuredEngines={empty ? ["gemini"] : ["chat_gpt"]}
      domain="acme.example.com"
      enginePrices={EMPTY_TRACKING_ENGINE_PRICES}
      entities={[promptsOwn, promptsNorth]}
      onAction={() => undefined}
      now={promptsModel().now}
      onOpenEvidence={() => undefined}
      onRun={onRun}
      panel={promptsAnswerPanel(empty)}
    />,
    { messages, timeZone: "UTC" },
  );
}

it("highlights brands, lists citations, and switches engines", async () => {
  panel(false);
  const north = screen.getAllByText("North").find((node) => node.tagName === "MARK");
  const acme = screen.getAllByText("Acme").find((node) => node.tagName === "MARK");
  expect(north?.tagName).toBe("MARK");
  expect(acme?.tagName).toBe("MARK");
  expect(north?.className).toContain("bg-yellow/15");
  expect(acme?.className).toContain("bg-blue/15");
  const brands = screen.getByRole("heading", { name: "Brands in this answer" }).parentElement;
  expect(brands?.textContent).toContain("North");
  expect(brands?.textContent?.indexOf("North")).toBeLessThan(
    brands?.textContent?.indexOf("You") ?? 0,
  );
  expect(screen.getByText("acme.example.com")).toBeInTheDocument();
  expect(
    screen.getByText("As users see it · DataForSEO · 3 weeks ago · $0.0012"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Gemini" }));
  expect(screen.getByRole("radio", { name: "Gemini" })).toBeChecked();
  expect(
    screen.getByText(
      (_, element) => element?.tagName === "P" && element.textContent === "Only North appears.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText("As users see it · DataForSEO · 3 weeks ago · $0.0012"),
  ).toBeInTheDocument();
});

it("offers a run action when no engine has answered", async () => {
  const onRun = vi.fn();
  panel(true, onRun);
  expect(screen.getByText(/No engine has answered this prompt yet/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Run in Gemini" }));
  expect(onRun).toHaveBeenCalledWith(promptsPromptId, "gemini");
});
