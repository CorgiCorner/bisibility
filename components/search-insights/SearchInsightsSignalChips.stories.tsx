import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";
import { SESSIONS_CONNECT_TITLE } from "./search-insights-copy";

const meta = {
  component: SearchInsightsSignalChips,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/SignalChips",
} satisfies Meta<typeof SearchInsightsSignalChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BothChips: Story = {
  args: { namedQueryCount: 1284, signals: { bandCount: 34, overlapCount: 12 } },
};

export const EmptyWindow: Story = {
  args: { namedQueryCount: 0, signals: { bandCount: 0, overlapCount: 0 } },
};

export const Pending: Story = { args: { namedQueryCount: 1284, state: "pending" } };

export const Failed: Story = { args: { namedQueryCount: 1284, state: "error" } };

export const WithIntegrationCard: Story = {
  args: {
    ga4Card: (
      <div className="rounded-card border border-dashed border-border-control px-4 py-3 text-ui-caption text-fg-muted">
        {SESSIONS_CONNECT_TITLE}
      </div>
    ),
    namedQueryCount: 1284,
    signals: { bandCount: 34, overlapCount: 12 },
  },
};
