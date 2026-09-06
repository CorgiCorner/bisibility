import {
  clicksToSessionsKpi,
  searchInsightsKpis,
  windowTotals,
} from "@/lib/search-insights/queries/kpis-model";
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

const reconciliationTotals = {
  current: windowTotals({ clicks: 12_500, impressions: 486_310, positionWeight: 8_948_104 }),
  previous: windowTotals({ clicks: 11_000, impressions: 448_210, positionWeight: 9_009_021 }),
};

const reconciliationSessions = { current: 11_500, previous: 9_680 };
const reconciliationKpis = searchInsightsKpis(reconciliationTotals);

export const ClicksToSessionsRatio: Story = {
  args: {
    extra: clicksToSessionsKpi(reconciliationTotals, reconciliationSessions),
    kpis: reconciliationKpis,
  },
};

export const Declining: Story = {
  args: {
    kpis: storyFirstView.kpis.map((kpi) => ({ ...kpi, delta: "-4.1%", dir: "down" as const })),
  },
};

export const ClicksToSessionsNoBaseline: Story = {
  args: {
    extra: clicksToSessionsKpi(reconciliationTotals, reconciliationSessions, false),
    kpis: searchInsightsKpis(reconciliationTotals, false),
  },
};

const zeroClicksTotals = {
  current: windowTotals({ clicks: 0, impressions: 152_480, positionWeight: 2_653_152 }),
  previous: reconciliationTotals.previous,
};

export const ClicksToSessionsHidden: Story = {
  args: {
    extra: clicksToSessionsKpi(zeroClicksTotals, { current: 0, previous: 9_680 }),
    kpis: searchInsightsKpis(zeroClicksTotals),
  },
};
