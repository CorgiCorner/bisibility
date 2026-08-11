import { SearchPerformanceAwaitingFirstSync } from "@/components/keyword-detail/empty/SearchPerformanceAwaitingFirstSync";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: SearchPerformanceAwaitingFirstSync,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Search performance awaiting first sync",
} satisfies Meta<typeof SearchPerformanceAwaitingFirstSync>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
