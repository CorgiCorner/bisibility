import { ProviderAttentionPreview } from "@/.storybook/prototypes/provider-recovery/ProviderAttentionPreview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/Provider attention",
  component: ProviderAttentionPreview,
  decorators: [withIntegrationMessages],
  render: (args) => (
    <ProviderAttentionPreview
      key={`${args.initialState}:${args.initialTab}:${args.canManage}:${args.totalChecks}:${args.simulateLoadError}:${args.initiallyDismissed}`}
      {...args}
    />
  ),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Storybook-only proposal for an active provider account incident. Check simulates a free account verification and moves to the independent usage-review step. Dismiss collapses the notice for its current state, keeps the connection status and pause visible, and allows Show details; this fixture does not persist dismissal. Affected checks use the shared virtual table and simulated cursor pages of 50 rows. No application actions, provider requests or accounting writes are performed. Historical imports are outside this proposal.",
      },
    },
  },
  argTypes: {
    initialState: {
      control: "select",
      options: ["billing", "checking", "review", "ready", "internal"],
    },
    initialTab: { control: "inline-radio", options: ["integration", "checks"] },
    canManage: { control: "boolean" },
    totalChecks: { control: { type: "number", min: 1, max: 10000, step: 1 } },
    simulateLoadError: { control: "boolean" },
    initiallyDismissed: { control: "boolean" },
  },
} satisfies Meta<typeof ProviderAttentionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BillingRequired: Story = { args: { initialState: "billing" } };
export const CheckingAccount: Story = { args: { initialState: "checking" } };
export const UsageUnderReview: Story = { args: { initialState: "review" } };
export const MonitoringReady: Story = { args: { initialState: "ready" } };
export const InternalFailure: Story = { args: { initialState: "internal" } };
export const AffectedChecks: Story = { args: { initialState: "billing", initialTab: "checks" } };
export const ReadOnlyMember: Story = { args: { canManage: false, initialState: "billing" } };
export const ThousandAffectedChecks: Story = {
  args: { initialState: "billing", initialTab: "checks", totalChecks: 1000 },
};
export const MoreChecksLoadError: Story = {
  args: {
    initialState: "billing",
    initialTab: "checks",
    totalChecks: 1000,
    simulateLoadError: true,
  },
};
export const DismissedBillingNotice: Story = {
  args: { initialState: "billing", initiallyDismissed: true },
};
export const DismissedSuccessNotice: Story = {
  args: { initialState: "ready", initiallyDismissed: true },
};

import { withIntegrationMessages } from "@/.storybook/with-integration-messages";
