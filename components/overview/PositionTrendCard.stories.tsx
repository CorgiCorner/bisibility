import { overviewFixture } from "@/components/overview/overview-fixtures";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import type { Meta, StoryObj } from "@storybook/react";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";

const meta = {
  title: "Overview/PositionTrendCard",
  component: PositionTrendCard,
  decorators: [
    (Story) => (
      <ProjectDashboardMessages>
        <div className="min-h-[360px] bg-bg p-6 text-fg">
          <div className="max-w-3xl">
            <Story />
          </div>
        </div>
      </ProjectDashboardMessages>
    ),
  ],
} satisfies Meta<typeof PositionTrendCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: overviewFixture.trendTakeaway,
  },
};

export const Empty: Story = {
  args: { data: [], empty: true },
};

export const FirstCheck: Story = {
  args: { data: [{ label: null, value: 3 }] },
};

export const Slipped: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: {
      days: 30,
      kind: "slipped",
      leader: "react data grid",
      value: 1.2,
      window: "lastThirtyDays",
    },
  },
};

export const Flat: Story = {
  args: {
    data: overviewFixture.trend,
    takeaway: { days: 30, kind: "steady", window: "lastThirtyDays" },
  },
};

export const ShortHistory: Story = {
  args: {
    data: overviewFixture.trend.slice(-4),
    takeaway: { days: 10, kind: "improved", value: 0.8, window: "firstTrackedDays" },
  },
};

export const LoadingTakeaway: Story = {
  args: { data: overviewFixture.trend, takeawayLoading: true },
};
