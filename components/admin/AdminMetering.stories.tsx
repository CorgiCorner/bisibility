import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { adminUsageFixture } from "@/lib/metering/shared-view-fixtures";
import instanceAdminMessages from "@/messages/core/en/instance-admin.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { AdminMeteringFilters } from "./AdminMeteringFilters";
import { AdminMeteringFrame } from "./AdminMeteringFrame";
import { AdminMeteringLoading } from "./AdminMeteringLoading";
import { AdminMeteringView } from "./AdminMeteringView";
import { AdminSectionLoading } from "./AdminSectionLoading";

const empty = adminUsageFixture();
empty.usage = { ...empty.usage, state: "empty", rows: [] };
const meta = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/app/admin/metering" } } },
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

export const Loading: Story = { args: { data: null }, render: () => <AdminMeteringLoading /> };
export const RecoveryLoading: Story = {
  args: { data: null },
  render: () => <AdminMeteringLoading incidents />,
};
export const FullPage: Story = {
  args: { data: adminUsageFixture() },
  render: (args) => (
    <AdminMeteringFrame>
      <AdminMeteringFilters month="2026-10" months={["2026-10"]} project={null} projects={[]} />
      <AdminMeteringView {...args} />
    </AdminMeteringFrame>
  ),
};

const many: import("@/lib/metering/admin-types").MeteringAdminData = adminUsageFixture();
const connections: Record<string, { project: string; provider: string }> = {};
many.references = { projects: {}, connections };
const budget = many.budgets[0];
if (!budget) throw new Error("Missing synthetic budget");
many.budgets = Array.from({ length: 15 }, (_, i) => {
  const target = `conn_synthetic_${String(i).padStart(18, "0")}`;
  connections[target] = {
    project: `Example project ${Math.floor(i / 3) + 1}`,
    provider: i % 2 ? "SerpApi" : "DataForSEO",
  };
  return { ...budget, id: `budget-${i}`, target, kind: "connection" as const };
});
export const ManyProjects: Story = { args: { data: many } };

export const AuditLoading: Story = {
  args: { data: null },
  render: () => <AdminSectionLoading section="audit" />,
};
export const AdministrationLoading: Story = {
  args: { data: null },
  render: () => <AdminSectionLoading section="administration" />,
};
