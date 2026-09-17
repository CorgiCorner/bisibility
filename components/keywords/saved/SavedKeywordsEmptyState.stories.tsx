import type { Meta, StoryObj } from "@storybook/react";
import { SavedKeywordsEmptyState } from "./SavedKeywordsEmptyState";

const meta = {
  component: SavedKeywordsEmptyState,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Keywords/Saved/Empty state",
} satisfies Meta<typeof SavedKeywordsEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    copy: {
      browseResearch: "Browse Keyword Research",
      cpc: "CPC",
      difficulty: "KD",
      emptyDescription:
        "Save ideas from Research to build a shortlist before you commit to tracking. Saving is free and runs no checks.",
      emptyTitle: "Nothing saved yet",
      intent: "Intent",
      keyword: "Keyword",
      volume: "Volume",
    },
    projectRef: "prj_1",
  },
};
