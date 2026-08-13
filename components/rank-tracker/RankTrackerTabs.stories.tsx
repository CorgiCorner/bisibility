import { RankTrackerTabs } from "@/components/rank-tracker/RankTrackerTabs";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Rank Tracker/Tabs",
  component: RankTrackerTabs,
  decorators: [
    (Story) => (
      <div className="min-h-[140px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  args: {
    activeTab: "checks",
    projectRef: "prj_story",
    savedCount: 36,
    trackedCount: 248,
  },
} satisfies Meta<typeof RankTrackerTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checks: Story = {};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] max-w-full overflow-x-auto">
        <Story />
      </div>
    ),
  ],
};
