import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminMeteringView } from "./AdminMeteringView";

const empty: MeteringAdminData = {
  usage: [],
  budgets: [],
  exceptions: [],
  projects: [],
  disagreements: "0",
  truncated: false,
};
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
export const Disagreement: Story = {
  args: {
    data: {
      ...empty,
      disagreements: "1",
      usage: [
        {
          id: "sample",
          connection: "connection_example",
          surface: "programmatic",
          funding: "byok",
          meter: "12.3456",
          legacy: "12.3400",
          difference: "0.0056",
          reserved: "1.0000 cents",
          certainty: "measured",
        },
      ],
      exceptions: [
        {
          id: "op_example",
          operation: "op_example",
          state: "pending",
          updatedAt: "2026-09-23T12:00:00Z",
        },
      ],
    },
  },
};
