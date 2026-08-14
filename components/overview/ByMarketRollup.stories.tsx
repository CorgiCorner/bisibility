import { ByMarketRollup } from "@/components/overview/ByMarketRollup";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import type { Meta, StoryObj } from "@storybook/react";

const rows: OverviewMarketRow[] = [
  {
    deltaPoints: -8,
    deltaTooltip: "Top-10 share -8pp vs Jul 26 - Aug 22, the previous 28 days.",
    languageLabel: "Dutch",
    locationId: "loc_be_nl",
    locationLabel: "Belgium",
    rangeDays: 28,
    researchAvailable: false,
    targetCount: 24,
    top10Count: 11,
    top10Share: 46,
    top10Tooltip:
      "Targets of this market currently ranking in positions 1 to 10, out of 24 active targets.",
    trend: [58, 54, 52, 49, 51, 48, 47, 46],
  },
  {
    deltaPoints: 6,
    deltaTooltip: "Top-10 share +6pp vs Jul 26 - Aug 22, the previous 28 days.",
    languageLabel: "French",
    locationId: "loc_be_fr",
    locationLabel: "Belgium",
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 18,
    top10Count: 10,
    top10Share: 56,
    top10Tooltip:
      "Targets of this market currently ranking in positions 1 to 10, out of 18 active targets.",
    trend: [60, 58, 61, 59, 57, 56, 55, 56],
  },
  {
    deltaPoints: -3,
    deltaTooltip: "Top-10 share -3pp vs Jul 26 - Aug 22, the previous 28 days.",
    languageLabel: "Spanish",
    locationId: "loc_es_es",
    locationLabel: "Spain",
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 32,
    top10Count: 21,
    top10Share: 66,
    top10Tooltip:
      "Targets of this market currently ranking in positions 1 to 10, out of 32 active targets.",
    trend: [52, 54, 57, 58, 61, 63, 65, 66],
  },
];

const meta = {
  component: ByMarketRollup,
  decorators: [
    (Story) => (
      <div className="min-h-[380px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Overview/ByMarketRollup",
} satisfies Meta<typeof ByMarketRollup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { device: "all", projectRef: "prj_story", rows },
};

export const SingleMarketHidden: Story = {
  args: { device: "desktop", projectRef: "prj_story", rows: rows.slice(0, 1) },
};
