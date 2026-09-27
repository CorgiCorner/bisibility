import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/PositionHistoryCard",
  component: PositionHistoryCard,
  args: { timeZone: "Europe/Warsaw" },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <DateDisplayProvider>
          <KeywordDetailStoryThemes>
            <div className="min-h-[400px] text-fg">
              <Story />
            </div>
          </KeywordDetailStoryThemes>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
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

export const UnrankedAfterDepthChange: Story = {
  args: {
    chartState: "normal",
    keyword: {
      ...keywordRows[0],
      position: 101,
      checkState: "not_ranked",
      trackedDepth: 50,
      positionHistory: [],
      positionObservations: [6, 5, 4, null].map((position, index) => ({
        checkedAt: new Date(Date.now() - (3 - index) * 86400000).toISOString(),
        comparisonKey: index < 2 ? "v2:20" : "v2:50",
        label: `Day ${index + 1}`,
        position,
      })),
    },
  },
};
