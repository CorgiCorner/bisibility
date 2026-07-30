import type { Meta, StoryObj } from "@storybook/react";
import { CostEstimateLine } from "./CostEstimateLine";

const meta = {
  component: CostEstimateLine,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Cost Estimate/CostEstimateLine",
} satisfies Meta<typeof CostEstimateLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {
  args: {
    budget: { capCents: 5000, spentCents: 1250 },
    checksPerMonth: 1200,
    costCents: 250,
    deltaCents: 50,
  },
};

export const CountsOnly: Story = { args: { checksPerMonth: 1200, costCents: null } };
