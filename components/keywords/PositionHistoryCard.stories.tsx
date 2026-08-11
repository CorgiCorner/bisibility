import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/PositionHistoryCard",
  component: PositionHistoryCard,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <div className="min-h-[400px] text-fg">
          <Story />
        </div>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: { chromatic: { viewports: [390, 768, 1440] } },
} satisfies Meta<typeof PositionHistoryCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { chartState: "normal", keyword: { ...keywordRows[2], targetPosition: 3 } },
};

export const TargetReached: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      positionHistory: keywordRows[1].positionHistory.map((point, index, points) => ({
        ...point,
        position: index === points.length - 1 ? 1 : point.position,
      })),
      targetPosition: 3,
    },
  },
};

export const NoTarget: Story = {
  args: { keyword: { ...keywordRows[0], targetPosition: null } },
};

export const MultipleChecksPerDay: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      positionHistory: [
        ...keywordRows[1].positionHistory,
        {
          checkedAt: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
          label: "Today",
          position: 2,
        },
        {
          checkedAt: new Date(new Date().setHours(16, 0, 0, 0)).toISOString(),
          label: "Today",
          position: 1,
        },
      ],
    },
  },
};

export const NoChecksInRange: Story = {
  args: {
    keyword: {
      ...keywordRows[1],
      positionHistory: [
        {
          checkedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
          label: "45 days ago",
          position: 2,
        },
        {
          checkedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
          label: "35 days ago",
          position: 1,
        },
      ],
      schedule: { ...keywordRows[1].schedule, frequency: "paused", next_check_at: null },
    },
  },
};

export const OneCheck: Story = {
  args: {
    chartState: "one_check",
    keyword: {
      ...keywordRows[1],
      positionHistory: [
        {
          checkedAt: "2026-08-10T10:00:00.000Z",
          label: "Today",
          position: 3,
        },
      ],
    },
  },
};
