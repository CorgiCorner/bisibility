import type { Meta, StoryObj } from "@storybook/react";
import { ResearchStatePanel } from "./ResearchStatePanel";

const meta = {
  args: { projectRef: "prj_1" },
  component: ResearchStatePanel,
  parameters: { layout: "padded" },
  title: "Research/States",
} satisfies Meta<typeof ResearchStatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { state: "idle" } };
export const Loading: Story = { args: { state: "loading" } };
export const NoProvider: Story = { args: { state: "no_provider" } };
export const BudgetExhausted: Story = {
  args: { resumeLabel: "August 1 at 2:00 AM", state: "budget_exhausted" },
};
export const NeedsReauth: Story = { args: { state: "needs_reauth" } };
export const LookupFailed: Story = { args: { retryLabel: "Retry ~$0.03", state: "lookup_failed" } };
export const Empty: Story = { args: { mode: "ideas", state: "empty" } };
export const UnsupportedLocation: Story = { args: { state: "unsupported_location" } };
