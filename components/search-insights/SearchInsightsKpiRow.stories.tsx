import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";
import { storyFirstView } from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsKpiRow,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/KpiRow",
} satisfies Meta<typeof SearchInsightsKpiRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FourCards: Story = { args: { kpis: storyFirstView.kpis } };

export const WithSecondSource: Story = {
  args: {
    extra: {
      delta: "+6.4%",
      dir: "up",
      label: "Organic sessions",
      prev: "14,008",
      source: "GA4",
      value: "14,905",
    },
    kpis: storyFirstView.kpis,
  },
};

export const Declining: Story = {
  args: {
    kpis: storyFirstView.kpis.map((kpi) => ({ ...kpi, delta: "-4.1%", dir: "down" as const })),
  },
};
