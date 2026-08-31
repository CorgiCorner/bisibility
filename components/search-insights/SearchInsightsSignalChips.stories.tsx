import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";

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

export const BothChips: Story = { args: { signals: { bandCount: 34, overlapCount: 12 } } };

export const EmptyWindow: Story = { args: { signals: { bandCount: 0, overlapCount: 0 } } };

export const WithIntegrationCard: Story = {
  args: {
    ga4Card: (
      <div className="rounded-card border border-dashed border-border-control px-4 py-3 text-ui-caption text-fg-muted">
        Organic sessions (GA4)
      </div>
    ),
    signals: { bandCount: 34, overlapCount: 12 },
  },
};
