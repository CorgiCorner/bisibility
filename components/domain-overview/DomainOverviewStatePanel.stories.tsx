import type { Meta, StoryObj } from "@storybook/react";
import { DomainOverviewStatePanel } from "./DomainOverviewStatePanel";

const meta = {
  args: { projectRef: "prj_story", state: "idle" },
  component: DomainOverviewStatePanel,
  decorators: [
    (Story) => (
      <div className="min-h-[420px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Domain Overview/State panel",
} satisfies Meta<typeof DomainOverviewStatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Loading: Story = { args: { state: "loading" } };
export const NoData: Story = {
  args: { market: "Austin, United States", state: "no_data", target: "example.com" },
};
export const Empty: Story = { args: { state: "empty" } };
export const Partial: Story = { args: { state: "partial" } };
export const NoProvider: Story = { args: { state: "no_provider" } };
export const NeedsReauth: Story = { args: { state: "needs_reauth" } };
export const BudgetExhausted: Story = { args: { state: "budget_exhausted" } };
export const LookupFailed: Story = { args: { charged: false, state: "lookup_failed" } };
export const UnsupportedLocation: Story = { args: { state: "unsupported_location" } };
