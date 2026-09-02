import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsContextCard } from "./SearchInsightsContextCard";

const meta = {
  args: {
    children: <span className="text-ui-caption text-fg-muted">Sub-bar controls</span>,
  },
  component: SearchInsightsContextCard,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Search Console/Context card",
} satisfies Meta<typeof SearchInsightsContextCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SubBarOnly: Story = {};

export const WithTrustStrip: Story = {
  args: {
    trustStrip: (
      <p className="bg-bg-sunken px-4 py-3 font-sans tabular-nums text-ui-caption text-fg-muted">
        Google data available through Jul 8, 2026
      </p>
    ),
  },
};
