import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { RankTrackerTabs } from "@/components/rank-tracker/RankTrackerTabs";
import messages from "@/messages/core/en/project-rank-tracker.json";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Rank Tracker/Tabs",
  component: RankTrackerTabs,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <div className="min-h-[140px] bg-bg p-6 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    activeTab: "runs",
    projectRef: "prj_story",
    runsCount: 1_248,
    savedCount: 36,
    trackedCount: 248,
  },
} satisfies Meta<typeof RankTrackerTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Runs: Story = {};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[360px] max-w-full overflow-x-auto">
        <Story />
      </div>
    ),
  ],
};
