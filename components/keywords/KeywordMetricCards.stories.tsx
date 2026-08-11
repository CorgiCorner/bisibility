import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { KeywordMetricCards } from "@/components/keywords/KeywordMetricCards";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/KeywordMetricCards",
  component: KeywordMetricCards,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <div className="min-h-[220px] text-fg">
          <Story />
        </div>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: { chromatic: { viewports: [390, 768, 1440] } },
} satisfies Meta<typeof KeywordMetricCards>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullContext: Story = {
  args: { keyword: keywordRows[1], keywordContext: "full" },
};

export const PartialContext: Story = {
  args: {
    keyword: { ...keywordRows[1], cpcKnown: false },
    keywordContext: "partial",
  },
};

export const UnavailableContext: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      cpcKnown: false,
      difficultyKnown: false,
      positionBaseline: null,
      volumeKnown: false,
    },
    keywordContext: "unavailable",
  },
};

export const SameDayRerun: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      position: 6,
      positionBaseline: 4,
      previousPosition: 6,
    },
    keywordContext: "full",
  },
};

export const NoChange: Story = {
  args: { keyword: keywordRows[1], keywordContext: "full", whatChanged: "no_change" },
};

export const FirstCheck: Story = {
  args: {
    keyword: { ...keywordRows[1], rankingUrlHistory: keywordRows[1].rankingUrlHistory.slice(0, 1) },
    keywordContext: "full",
    whatChanged: "first_check",
  },
};
