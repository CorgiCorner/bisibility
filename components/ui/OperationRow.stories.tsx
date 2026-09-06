import { OperationRow, type OperationRowProps } from "@/components/ui/OperationRow";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

const defaults = {
  variant: "inline",
  state: "running",
  title: "Manual rank check",
  meta: "350 keywords by filter",
  unit: "checks",
  etaSeconds: 240,
  total: 700,
  completed: 126,
  failed: 0,
  deferred: 0,
  provider: "DataForSEO",
  actor: "Anna",
  action: "cancel",
  href: null,
  counts: null,
  showBar: true,
  onAction: fn(),
  nextCheckAt: null,
  now: "2026-09-02T10:00:00.000Z",
  resumeDate: null,
  stateLine: null,
  status: null,
} satisfies OperationRowProps;

const meta = {
  title: "Components/OperationRow",
  component: OperationRow,
  args: defaults,
  decorators: [
    (Story) => (
      <div className="w-full max-w-[560px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OperationRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };
export const ShowbarFalse: Story = { args: { showBar: false }, name: "showbar-false" };
export const VariantCompact: Story = {
  args: { variant: "compact" },
  name: "variant-compact",
};
export const VariantModal: Story = { args: { variant: "modal" }, name: "variant-modal" };
export const Action: Story = { args: { action: "" }, name: "action" };
export const ActionPause: Story = { args: { action: "pause" }, name: "action-pause" };
export const ActionResume: Story = { args: { action: "resume" }, name: "action-resume" };
export const ActionRetry: Story = { args: { action: "retry" }, name: "action-retry" };
export const StateQueued: Story = { args: { state: "queued" }, name: "state-queued" };
export const StateRetrying: Story = {
  args: { state: "retrying" },
  name: "state-retrying",
};
export const StatePartial: Story = { args: { state: "partial" }, name: "state-partial" };
export const StateSucceeded: Story = {
  args: { state: "succeeded" },
  name: "state-succeeded",
};
export const StateFailed: Story = { args: { state: "failed" }, name: "state-failed" };
export const StateCancelled: Story = {
  args: { state: "cancelled" },
  name: "state-cancelled",
};
export const StateCancelling: Story = {
  args: { state: "cancelling" },
  name: "state-cancelling",
};
export const StateDeferred: Story = {
  args: { state: "deferred" },
  name: "state-deferred",
};
export const StateBudget: Story = { args: { state: "budget" }, name: "state-budget" };
export const StateQuota: Story = { args: { state: "quota" }, name: "state-quota" };
export const StateWorker: Story = { args: { state: "worker" }, name: "state-worker" };
