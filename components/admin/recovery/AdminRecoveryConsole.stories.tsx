import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import messages from "@/messages/core/en/instance-admin.json";
import shared from "@/messages/core/en/shared.json";
import pl from "@/messages/core/pl/instance-admin.json";
import sharedPl from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminRecoveryConsole } from "./AdminRecoveryConsole";

const meta = {
  title: "Admin/Task recovery",
  component: AdminRecoveryConsole,
  decorators: [
    (Story, context) => (
      <FeatureMessagesProvider
        locale={context.parameters.recoveryLocale ?? "en"}
        timeZone="UTC"
        messages={mergeMessageCatalogs(
          context.parameters.recoveryLocale === "pl" ? sharedPl : shared,
          context.parameters.recoveryLocale === "pl" ? pl : messages,
        )}
      >
        <div className="mx-auto max-w-7xl p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AdminRecoveryConsole>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedCases: Story = { args: { initial: recoveryViewFixture() } };
export const Unavailable: Story = { args: { initial: null } };
export const Polish: Story = {
  args: { initial: recoveryViewFixture() },
  parameters: { recoveryLocale: "pl" },
};
export const Empty: Story = {
  args: {
    initial: {
      ...recoveryViewFixture(),
      rows: [],
      summary: {
        unconfirmed: 0,
        overdue: 0,
        historical: 0,
        failed: 0,
        unfinished: 0,
        retainedResults: 0,
        lastActivityAt: null,
        lastCompletedAt: null,
        lastCleanAt: null,
      },
    },
  },
};
