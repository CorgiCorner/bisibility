import type { Meta, StoryObj } from "@storybook/react";
import { ResearchPageLoading, ResearchResultsLoading } from "./ResearchLoadingSkeletons";

const meta = {
  component: ResearchPageLoading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Research/Loading",
} satisfies Meta<typeof ResearchPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Results: Story = {
  render: () => <ResearchResultsLoading />,
};
