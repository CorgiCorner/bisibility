import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { projectResearchQuestions } from "@/lib/ai-research/prompt-research-projection";
import { emptyResearchTabContext } from "@/lib/ai-research/research-tab-model";
import type { AiResearchRow } from "@/lib/ai-research/types";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { userEvent, within } from "storybook/test";
import { PromptResearchClient } from "./PromptResearchClient";
import { PromptResearchReview } from "./PromptResearchReview";
import {
  researchPageFixture,
  researchQuoteFixture,
  researchResultFixture,
} from "./prompt-research-fixtures";

const meta = {
  title: "Prompt Research/Keyword research",
  component: PromptResearchClient,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <FeatureMessagesProvider
          locale="en"
          messages={{ ...shared, ...tracking, ...research }}
          timeZone="UTC"
        >
          <Story />
        </FeatureMessagesProvider>
      </QueryClientProvider>
    ),
  ],
  args: { projectId: "prj_example", data: researchPageFixture },
  parameters: { nextjs: { appDirectory: true }, chromatic: { viewports: [390, 1440] } },
} satisfies Meta<typeof PromptResearchClient>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Keywords: Story = {};
export const NoProvider: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Supported providers: DataForSEO.");
  },
  args: { data: { ...researchPageFixture, hasSource: false } },
};
export const Results: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const index of [0, 2, 3]) {
      await userEvent.click(
        canvas.getByRole("button", {
          name: `Show the answer for ${researchResultFixture.prompts[index].text}`,
        }),
      );
    }
  },
  args: { keyword: "tools", data: { ...researchPageFixture, initial: researchResultFixture } },
};
export const Empty: Story = {
  args: {
    keyword: "tools",
    data: { ...researchPageFixture, initial: { ...researchResultFixture, prompts: [] } },
  },
};
export const Reader: Story = {
  args: { keyword: "tools", data: { ...researchPageFixture, canWrite: false } },
};

export const NoKeywords: Story = { args: { data: { ...researchPageFixture, keywords: [] } } };
export const Cached: Story = {
  ...Results,
};
export const Estimate: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Find prompts/ }));
  },
  args: { keyword: "tools", data: { ...researchPageFixture, initial: researchQuoteFixture } },
};
export const NoSource: Story = {
  args: {
    keyword: "tools",
    data: {
      ...researchPageFixture,
      initial: { ok: false, reason: "no_source", message: "No source" },
    },
  },
};
export const MobileResults: Story = {
  ...Results,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const ReviewDrawer: Story = {
  args: Results.args,
  render: (args) => (
    <>
      <PromptResearchClient {...args} />
      <PromptResearchReview
        projectId={args.projectId}
        keyword="tools"
        reportId={researchResultFixture.reportId}
        prompts={[researchResultFixture.prompts[0], researchResultFixture.prompts[7]]}
        topics={researchPageFixture.topics}
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    </>
  ),
};

export const LoadingEstimate: Story = {
  args: { keyword: "loading-preview", data: researchPageFixture },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Find prompts" }));
  },
};

const presenceRows: AiResearchRow[] = [
  {
    answer: "North leads the directory.",
    brandMentioned: false,
    citations: [],
    datasetVolume: 1200,
    domainCited: false,
    model: "chat_gpt",
    observedAt: "2026-10-24T00:00:00Z",
    prompt: "what directories list tools",
  },
  {
    answer: "Example and North appear together.",
    brandMentioned: false,
    citations: [],
    datasetVolume: 80,
    domainCited: false,
    model: "chat_gpt",
    observedAt: "2026-10-24T00:00:00Z",
    prompt: "which directories name both",
  },
  {
    answer: "Example publishes the catalog.",
    brandMentioned: false,
    citations: [],
    datasetVolume: 20,
    domainCited: false,
    model: "chat_gpt",
    observedAt: "2026-10-24T00:00:00Z",
    prompt: "who publishes the catalog",
  },
  {
    answer: "Read the guide.",
    brandMentioned: false,
    citations: [],
    datasetVolume: 4,
    domainCited: false,
    model: "chat_gpt",
    observedAt: "2026-10-24T00:00:00Z",
    prompt: "how do teams start",
  },
];

export const Presence: Story = {
  args: {
    context: {
      ...emptyResearchTabContext("prj_example"),
      competitors: [{ label: "North" }],
      dailyUsdPerPrompt: 0.01,
      engines: ["chat_gpt"],
      entities: [
        {
          id: "project",
          kind: "project",
          label: "Example",
          names: { domain: "example.com", label: "Example" },
        },
        {
          id: "north",
          kind: "competitor",
          label: "North",
          names: { domain: "north.example.org", label: "North" },
        },
      ],
    },
    data: {
      ...researchPageFixture,
      initial: {
        cached: true,
        costCents: 0,
        estimate: false,
        ok: true,
        prompts: projectResearchQuestions(presenceRows, {
          brand: "Stored",
          domain: "stored.example",
          tracked: [],
        }),
        reportId: "agr_a00000000000000000000000",
        result: {
          costCents: 0,
          costStatus: "confirmed",
          evidence: "observed_dataset",
          failure: null,
          fetchedAt: "2026-10-24T00:00:00Z",
          rows: presenceRows,
          totalAvailable: presenceRows.length,
          truncated: false,
        },
      },
    },
    keyword: "directories",
  },
};
