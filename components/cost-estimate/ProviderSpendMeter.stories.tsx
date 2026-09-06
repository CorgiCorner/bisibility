import { ProviderSpendMeter } from "@/components/cost-estimate/ProviderSpendMeter";
import type { Meta, StoryObj } from "@storybook/react";

const docsHref = "/docs/integrations#budget-cap";
const twoProviders = [
  { label: "DataForSEO", spentCents: 940 },
  { label: "SerpApi", spentCents: 300 },
] as const;

const meta = {
  args: {
    capCents: 5000,
    docsHref,
    spentCents: 1240,
    variant: "segmented",
  },
  argTypes: {
    capCents: { control: "number", name: "cap" },
    providers: { control: "object" },
    sessionCents: { control: "number", name: "session" },
    spentCents: { control: "number", name: "spent" },
    variant: { control: "select", options: ["segmented", "card"] },
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

export const SegmentedTwoProviders: Story = {
  args: { providers: twoProviders, variant: "segmented" },
  name: "Segmented/TwoProviders",
};

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

export const CardNoCap: Story = {
  args: { capCents: null, spentCents: 0, variant: "card" },
  name: "Card/No cap",
};

export const CardWithCap: Story = {
  args: { sessionCents: 9, variant: "card" },
  name: "Card/With cap",
};
