import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { InstanceEmailAllowance } from "@/lib/email/allowance-model";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminEmailAllowance } from "./AdminEmailAllowance";

const allowance: InstanceEmailAllowance = {
  asOf: "2026-10-14T23:59:00.000Z",
  day: "2026-10-14T00:00:00.000Z",
  resetsAt: "2026-10-15T00:00:00.000Z",
  scope: "installation",
  status: "available",
  categories: [
    { category: "bulk", limit: 1000, reservedAttempts: 950, remaining: 50 },
    { category: "transactional", limit: 1000, reservedAttempts: 0, remaining: 1000 },
  ],
};
const meta = {
  title: "Admin/Email allowance",
  component: AdminEmailAllowance,
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
} satisfies Meta<typeof AdminEmailAllowance>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Configured: Story = { args: { allowance } };
export const NotConfigured: Story = {
  args: { allowance: { ...allowance, status: "not_configured", categories: [] } },
};
export const Unavailable: Story = {
  args: {
    allowance: {
      ...allowance,
      status: "unavailable",
      categories: allowance.categories.map((row) => ({
        ...row,
        remaining: null,
        reservedAttempts: null,
      })),
    },
  },
};
export const CapabilityUnknown: Story = {
  args: { allowance: { ...allowance, status: "unavailable", categories: [] } },
};
