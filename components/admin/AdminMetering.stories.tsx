import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { adminUsageFixture } from "@/lib/metering/shared-view-fixtures";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminMeteringView } from "./AdminMeteringView";

const empty = adminUsageFixture();
empty.usage = { ...empty.usage, state: "empty", rows: [] };
const meta = {
  title: "Admin/Metering",
  component: AdminMeteringView,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, instanceAdminMessages)}
      >
        <div className="mx-auto max-w-6xl p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AdminMeteringView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { data: empty } };
export const Unavailable: Story = { args: { data: null } };
export const Recorded: Story = { args: { data: adminUsageFixture() } };
