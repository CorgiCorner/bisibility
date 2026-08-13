import type { Meta, StoryObj } from "@storybook/react";
import {
  DomainOverviewPageLoading,
  DomainOverviewResultsLoading,
} from "./DomainOverviewLoadingSkeletons";

const meta = {
  component: DomainOverviewPageLoading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Domain Overview/Loading",
} satisfies Meta<typeof DomainOverviewPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};
export const Results: Story = { render: () => <DomainOverviewResultsLoading /> };
