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

export const RoutePage: Story = { args: { ariaLabel: "Domain Overview page loading" } };
export const Results: Story = {
  args: { ariaLabel: "Domain Overview loading" },
  render: () => <DomainOverviewResultsLoading ariaLabel="Domain Overview loading" />,
};
