import { overviewFixture } from "@/components/overview/overview-fixtures";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/PositionTrendCard",
  component: PositionTrendCard,
  decorators: [
    (Story) => (
      <div className="min-h-[360px] bg-bg p-6 text-fg">
        <div className="max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof PositionTrendCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: "Avg position improved 1.8 in the last 30 days, led by 'headless cms'",
  },
};

export const Empty: Story = {
  args: { data: [], empty: true },
};

export const FirstCheck: Story = {
  args: { data: [{ label: "now", value: 3 }] },
};

export const Slipped: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: "Avg position slipped 1.2 in the last 30 days · biggest drop: 'react data grid'",
  },
};

export const Flat: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: "Avg position held steady over the last 30 days",
  },
};

export const ShortHistory: Story = {
  args: {
    data: overviewFixture.trend.slice(-4),
    takeaway: "Avg position improved 0.8 in the first 10 days of tracking",
  },
};

export const LoadingTakeaway: Story = {
  args: { data: overviewFixture.trend, takeawayLoading: true },
};
