import { KeywordMetricCards } from "@/components/keywords/KeywordMetricCards";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/KeywordMetricCards",
  component: KeywordMetricCards,
  decorators: [
    (Story) => (
      <div className="min-h-[220px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordMetricCards>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keyword: keywordRows[1] },
};

export const MissingEnrichmentData: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      cpcKnown: false,
      difficultyKnown: false,
      positionBaseline: null,
      volumeKnown: false,
    },
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
  },
};
