import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ResearchedPrompt } from "@/lib/ai-research/prompt-research-projection";
import type { ResearchQuestion } from "@/lib/ai-research/research-questions";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ResearchQuestionTable } from "./ResearchQuestionTable";

vi.mock("@/lib/capacity/client-actions", () => ({ trackPromptResearchAction: vi.fn() }));

function prompt(text: string, rowIndex: number): ResearchedPrompt {
  return {
    brandMentioned: false,
    contentTruncated: false,
    ownDomainCited: false,
    rowIndex,
    sources: [],
    text,
    tracked: false,
    variants: [],
  };
}

function question(
  id: string,
  text: string,
  presence: ResearchQuestion["presence"],
  volume?: number,
): ResearchQuestion {
  return {
    answer: text,
    brands: [],
    contentTruncated: false,
    id,
    label: text,
    model: "chat_gpt",
    observedAt: null,
    presence,
    prompt: prompt(text, Number(id)),
    rowIndex: Number(id),
    text,
    tracked: false,
    volume,
    youNamed: presence === "only_you" || presence === "shared",
  };
}

const questions = [
  question("0", "what directories list tools", "missing", 1200),
  question("1", "which directories name both", "shared", 40),
  question("2", "who publishes the catalog", "only_you", 8),
  question("3", "how do teams start", "unmentioned"),
];

function view(dailyUsdPerPrompt: number | null = 0.01) {
  return render(
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...shared, ...tracking, ...research }}
      timeZone="UTC"
    >
      <ResearchQuestionTable
        canWrite
        dailyUsdPerPrompt={dailyUsdPerPrompt}
        engines={["chat_gpt"]}
        entities={[]}
        keyword="directories"
        projectId="prj_public"
        questions={questions}
        reportId="agr_a00000000000000000000000"
        topics={[]}
      />
    </FeatureMessagesProvider>,
  );
}

it("filters presence and topics from the current rows and prices the selection", async () => {
  const user = userEvent.setup();
  view();
  expect(screen.getByRole("tab", { name: "All 4" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Missing 1" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Shared 1" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Only you 1" })).toBeVisible();
  expect(screen.getByText("1.2K")).toBeVisible();
  expect(screen.getAllByText("-").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("tab", { name: "Missing 1" }));
  expect(screen.getByText("what directories list tools")).toBeVisible();
  expect(screen.queryByText("which directories name both")).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "All 4" }));
  await user.click(screen.getByRole("button", { name: "Directories 2" }));
  expect(screen.getByText("which directories name both")).toBeVisible();
  expect(screen.queryByText("who publishes the catalog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("checkbox", { name: "Select what directories list tools" }));
  expect(screen.getByText("Track daily in ChatGPT · about $0.01 a day")).toBeVisible();
  expect(screen.getAllByText("1 selected").length).toBeGreaterThan(0);
});

it("omits the daily cost when the price card has no bound", async () => {
  const user = userEvent.setup();
  view(null);
  await user.click(screen.getByRole("checkbox", { name: "Select what directories list tools" }));
  expect(screen.getByText("Track daily in ChatGPT")).toBeVisible();
  expect(screen.queryByText(/a day/)).not.toBeInTheDocument();
});
