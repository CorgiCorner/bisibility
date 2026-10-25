import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { EvidenceProjectionBands } from "./EvidenceProjectionBands";

const meta = {
  title: "Checks/Evidence/Projections",
  component: EvidenceProjectionBands,
  decorators: [withEvidenceMessages],
  args: { onFilterChange: fn() },
} satisfies Meta<typeof EvidenceProjectionBands>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnderReview: Story = { args: { counts: { under_review: 4 } } };
export const Recovered: Story = { args: { counts: { recovered: 5 } } };
export const Partial: Story = { args: { counts: { partial: 2 } } };
export const ProviderError: Story = { args: { counts: { provider_error: 3 } } };
export const Missing: Story = { args: { counts: { missing: 1 } } };
export const CostConflict: Story = { args: { counts: { cost_conflict: 2 } } };
export const AllStates: Story = {
  args: {
    counts: {
      under_review: 4,
      recovered: 5,
      partial: 2,
      provider_error: 3,
      missing: 1,
      cost_conflict: 2,
    },
  },
};
