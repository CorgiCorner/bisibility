import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { BrandNameSet } from "@/lib/ai-tracking/brand-name-match";
import { EMPTY_TRACKING_ENGINE_PRICES } from "@/lib/ai-tracking/tracking-engines";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilityAddPromptDialog } from "./AiVisibilityAddPromptDialog";

const messages = { ...shared, ...tracking };
const ownNames: BrandNameSet = {
  aliases: [],
  domain: "acme.example.com",
  excludedNames: [],
  label: "Acme",
};

afterEach(() => {
  cleanup();
});

function dialog(
  props: Partial<Parameters<typeof AiVisibilityAddPromptDialog>[0]> = {},
  onCreate = vi.fn(async () => ({ created: 1, skipped: 0 })),
) {
  renderWithFeatureMessages(
    <AiVisibilityAddPromptDialog
      enginePrices={EMPTY_TRACKING_ENGINE_PRICES}
      existingTexts={["Which tools help a small team?"]}
      onClose={() => undefined}
      onCreate={onCreate}
      onCreateTopic={async () => "ait_abcdefghijklmnopqrstuvwx"}
      open
      ownNames={ownNames}
      enginesHref="/app/prj_example/ai-visibility?tab=engines"
      enabledEngines={[{ engine: "chat_gpt", source: "consumer_scrape" }]}
      topics={[{ id: "ait_abcdefghijklmnopqrstuvwx", name: "Tools" }]}
      {...props}
    />,
    { messages, timeZone: "UTC" },
  );
  return onCreate;
}

it("counts characters and warns when the prompt names the brand", async () => {
  dialog();
  const field = screen.getByRole("textbox", { name: "Prompt" });
  await userEvent.type(field, "Hello");
  expect(screen.getByText("5 / 200")).toBeInTheDocument();
  fireEvent.change(field, { target: { value: "What is Acme?" } });
  expect(
    screen.getByText("This prompt names your brand, so it will count as branded"),
  ).toBeInTheDocument();
  fireEvent.change(field, { target: { value: "a".repeat(201) } });
  expect(screen.getByText("201 / 200")).toBeInTheDocument();
  expect(screen.getByText(/limited to 200 characters/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
});

it("creates only the valid bulk lines and reports the skipped ones", async () => {
  const onCreate = dialog({ defaultMode: "bulk" });
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
    target: {
      value: `A fresh customer question\n\nWhich tools help a small team?\n${"x".repeat(201)}`,
    },
  });
  expect(screen.getByText("Line 2: Empty")).toBeInTheDocument();
  expect(screen.getByText("Line 3: Already tracked")).toBeInTheDocument();
  expect(screen.getByText("Line 4: Longer than 200 characters")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(onCreate).toHaveBeenCalledWith({
    texts: ["A fresh customer question"],
    topicId: null,
  });
});

it("names the engines of the next run without a picker", () => {
  dialog();
  const choice = screen.getByRole("link", { name: "Runs in ChatGPT." });
  expect(choice).toHaveAttribute("href", "/app/prj_example/ai-visibility?tab=engines");
  expect(screen.queryByRole("button", { name: "Engines" })).not.toBeInTheDocument();
});

it("shows a per-run cost only when the server sent a bound", () => {
  dialog();
  expect(screen.queryByText(/per run/)).not.toBeInTheDocument();
  cleanup();
  dialog({
    enginePrices: { usdByEngine: { chat_gpt: 0.12, gemini: 0.12, google: 0.12 } },
  });
  expect(screen.getByText(/per run/)).toBeInTheDocument();
});
