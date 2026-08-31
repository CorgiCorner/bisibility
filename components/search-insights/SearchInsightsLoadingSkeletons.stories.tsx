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

export const RoutePage: Story = {};
export const ContextCard: Story = { render: () => <SearchInsightsContextLoading /> };
export const TrustStrip: Story = { render: () => <SearchInsightsTrustStripLoading /> };
export const StreamedBody: Story = {
  render: () => (
    <div className="p-4">
      <SearchInsightsBodyLoading />
    </div>
  ),
};
