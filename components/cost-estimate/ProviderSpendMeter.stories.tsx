import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import type { Meta, StoryObj } from "@storybook/react";

const docsHref = "/docs/integrations#budget-cap";
const twoProviders = [
  { label: "DataForSEO", spentCents: 940 },
  { label: "SerpApi", spentCents: 300 },
] as const;

const meta = {
  args: { capCents: 5000, docsHref, spentCents: 1240, variant: "header" },
  argTypes: {
    capCents: { control: "number", name: "cap" },
    providers: { control: "object" },
    sessionCents: { control: "number", name: "session" },
    spentCents: { control: "number", name: "spent" },
    variant: { control: "select", options: ["header", "segmented", "card"] },
  },
  component: ProviderSpendMeter,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Cost Estimate/ProviderSpendMeter",
} satisfies Meta<typeof ProviderSpendMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderNormal: Story = {
  args: { sessionCents: 9 },
  name: "Header/Normal",
};

export const HeaderWarning80: Story = {
  args: { spentCents: 4300 },
  name: "Header/Warning80",
};

export const HeaderExhausted: Story = {
  args: { spentCents: 5000 },
  name: "Header/Exhausted",
};

// The header bar stays a single-color aggregate even with multiple providers.
export const HeaderMultiProviderAggregate: Story = {
  args: { providers: twoProviders, sessionCents: 9 },
  name: "Header/MultiProviderAggregate",
};

export const SegmentedTwoProviders: Story = {
  args: { providers: twoProviders, variant: "segmented" },
  name: "Segmented/TwoProviders",
};

// Providers sum to 86% of cap: the whole bar renders warning-yellow, legend stays.
export const SegmentedThresholdOverride: Story = {
  args: {
    providers: [
      { label: "DataForSEO", spentCents: 3400 },
      { label: "SerpApi", spentCents: 900 },
    ],
    spentCents: 4300,
    variant: "segmented",
  },
  name: "Segmented/ThresholdOverride",
};

export const CardDefault: Story = {
  args: { onPaceCents: 1750, sessionCents: 9, variant: "card" },
  name: "Card/Default",
};

// Day 1 of the month: the on-pace projection is suppressed.
export const CardFirstDaysNoPace: Story = {
  args: { now: new Date("2026-07-01T12:00:00.000Z"), sessionCents: 9, variant: "card" },
  name: "Card/FirstDaysNoPace",
};
