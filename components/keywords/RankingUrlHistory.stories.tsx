import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/RankingUrlHistory",
  component: RankingUrlHistory,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <div className="min-h-[320px] text-fg">
          <Story />
        </div>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: { chromatic: { viewports: [390, 768, 1440] } },
} satisfies Meta<typeof RankingUrlHistory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Diff: Story = {
  args: { keyword: keywordRows[1] },
};

export const NoChange: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      rankingUrlHistory: keywordRows[1].rankingUrlHistory.map((event, index) => ({
        ...event,
        note: event.isCurrent ? "Current" : index === 0 ? "First seen ranking" : null,
        url: "https://example.com/rank-tracking",
      })),
    },
  },
};

export const FirstCheck: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      rankingUrlHistory: keywordRows[1].rankingUrlHistory.slice(0, 1).map((event) => ({
        ...event,
        isCurrent: true,
        note: "Current",
      })),
    },
  },
};
