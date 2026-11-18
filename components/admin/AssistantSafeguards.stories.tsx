import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import polishInstanceAdmin from "@/messages/core/pl/instance-admin.json";
import polishShared from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AssistantSafeguards } from "./AssistantSafeguards";

const guards = {
  "assistant.guard.platformHourlyCents": 2000,
  "assistant.guard.platformDailyCents": 10000,
  "assistant.guard.unsettledAttempts": 25,
  "assistant.guard.teamDailyCents": 1000,
  "assistant.guard.teamConcurrentTurns": 2,
  "assistant.guard.debtAlertCents": 100,
};

const meta = {
  title: "Admin/Assistant safeguards",
  component: AssistantSafeguards,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, instanceAdminMessages)}
      >
        <div className="mx-auto max-w-4xl p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AssistantSafeguards>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Running: Story = { args: { level: "on", guards, editable: true } };
export const CreditsPaused: Story = { args: { level: "hosted_off", guards, editable: true } };
export const TrippedByDashboard: Story = {
  args: {
    level: "hosted_off",
    guards,
    editable: true,
    trip: {
      at: "2026-11-15T22:31:05.000Z",
      reason: "provider_cap_exceeded",
      spendUsd: "487.20",
      capUsd: "500.00",
    },
  },
};
export const DemoReadOnly: Story = { args: { level: "on", guards, editable: false } };
export const PolishLongestLabels: Story = {
  args: { ...TrippedByDashboard.args, level: "hosted_off", guards, editable: true },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="pl"
        timeZone="UTC"
        messages={mergeMessageCatalogs(polishShared, polishInstanceAdmin)}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
};
