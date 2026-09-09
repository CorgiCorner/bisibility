import { RunsSection } from "@/components/rank-runs/RunsSection";
import { historyPage, plannedPage } from "@/components/rank-runs/runs-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";

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
    schedulesHref: "/app/prj_story/runs/schedules",
  },
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof RunsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "default",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("table", { name: "Runs" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Scheduled" })).toHaveAttribute(
      "href",
      "/app/prj_story/runs/rank-checks/rcr_history_0001",
    );
  },
};

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
