import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import adminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminDashboard } from "./AdminDashboard";
import { AdminDashboardLoading } from "./AdminDashboardLoading";
import { baseData } from "./admin-dashboard-test-fixtures";

const data = {
  ...baseData,
  worker: {
    ...baseData.worker,
    appliedMigration: "20261012201100_measurement_settings_mutation_receipt",
    bundledMigration: "20261012201100_measurement_settings_mutation_receipt",
    release: "efcb2093388b5b7102e87ba3d20827eab538ab9c",
  },
};

const meta = {
  title: "Admin/Dashboard",
  component: AdminDashboard,
  args: { data },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, adminMessages)}
      >
        <DateDisplayProvider>
          <main className="min-h-screen bg-bg p-4 text-fg sm:p-6" data-admin-dashboard-fixture>
            <Story />
          </main>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AdminDashboard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Healthy: Story = {};
export const Loading: Story = { render: () => <AdminDashboardLoading /> };
export const Unavailable: Story = {
  args: {
    data: {
      ...data,
      availability: {
        dataSources: false,
        opsDelivery: false,
        opsEvents: false,
        presence: false,
        rankChecks: false,
        stats: false,
        worker: false,
      },
    },
  },
};
