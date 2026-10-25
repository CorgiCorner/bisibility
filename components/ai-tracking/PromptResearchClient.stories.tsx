import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
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
          name: `Show sources for ${researchResultFixture.prompts[index].text}`,
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
export const Estimate: Story = {
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
