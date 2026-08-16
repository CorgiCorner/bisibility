import { OverviewPageLoading, OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: OverviewPageLoading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Overview/LoadingSkeleton",
} satisfies Meta<typeof OverviewPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};
export const Inline: Story = { render: () => <OverviewSkeleton /> };
