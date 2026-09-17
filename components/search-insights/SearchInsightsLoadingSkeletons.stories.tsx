import type { Meta, StoryObj } from "@storybook/react";
import {
  SearchInsightsBodyLoading,
  SearchInsightsContextLoading,
  SearchInsightsPageLoading,
  SearchInsightsTrustStripLoading,
} from "./SearchInsightsLoadingSkeletons";

const meta = {
  component: SearchInsightsPageLoading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/Loading",
} satisfies Meta<typeof SearchInsightsPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoutePage: Story = {
  args: {
    bodyAriaLabel: "Search Console data loading",
    pageAriaLabel: "Search Console page loading",
  },
};
export const ContextCard: Story = {
  args: RoutePage.args,
  render: () => <SearchInsightsContextLoading />,
};
export const TrustStrip: Story = {
  args: RoutePage.args,
  render: () => <SearchInsightsTrustStripLoading />,
};
export const StreamedBody: Story = {
  args: RoutePage.args,
  render: () => (
    <div className="p-4">
      <SearchInsightsBodyLoading ariaLabel="Search Console data loading" />
    </div>
  ),
};
