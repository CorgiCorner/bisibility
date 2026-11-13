import type { Meta, StoryObj } from "@storybook/react";
import { ConversionSourceSwitch } from "./ConversionSourceSwitch";

const meta = {
  component: ConversionSourceSwitch,
  title: "Conversions/Source switch",
} satisfies Meta<typeof ConversionSourceSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

const ga4 = { label: "GA4", primary: true, source: "ga4" as const };
const plausible = { label: "Plausible", primary: false, source: "plausible" as const };

export const OneSource: Story = {
  args: { options: [ga4], value: "ga4" },
};

export const TwoSources: Story = {
  args: { options: [ga4, plausible], value: "ga4" },
};
