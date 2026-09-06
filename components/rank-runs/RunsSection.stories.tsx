import { RunsSection } from "@/components/rank-runs/RunsSection";
import { historyPage, plannedPage } from "@/components/rank-runs/runs-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "dashboard-runs",
  component: RunsSection,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-8">
        <div className="mx-auto max-w-[1080px]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    budgetExhausted: true,
    budgetSettingsHref: "/app/prj_story/settings/usage?budget=edit",
    initialHistory: historyPage,
    initialPlanned: plannedPage,
    projectRef: "prj_story",
    schedulesHref: "/app/prj_story/rank-tracker/schedules",
  },
} satisfies Meta<typeof RunsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const OpsstateIdle: Story = { name: "opsstate-idle" };

export const OpsstateAttention: Story = { name: "opsstate-attention" };

export const OpstoneYellow: Story = { name: "opstone-yellow" };

export const ThemeDark: Story = {
  name: "theme-dark",
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
};

export const SegmentPlanned: Story = {
  args: { initialSegment: "planned" },
  name: "segment-planned",
};
