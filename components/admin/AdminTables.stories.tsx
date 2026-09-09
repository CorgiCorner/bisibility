import { AdminAuditTable } from "@/components/admin/AdminAuditTable";
import { AdminProviderUsageTable } from "@/components/admin/AdminProviderUsageTable";
import { AdminAdministrationConsumptionTable } from "@/components/admin/admin-administration-tables";
import { AdminDashboardOpsEventsTable } from "@/components/admin/admin-dashboard-tables";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";
import type { InstanceAdminAuditPage } from "@/lib/queries/instance-admin-audit";
import type { Meta, StoryObj } from "@storybook/react";

const auditEntries = [
  {
    action: "instance_admin.account_viewed",
    actorEmail: "admin@example.com",
    createdAt: "2026-09-05T08:30:00.000Z",
    id: "audit_admin_viewed",
    result: "ok",
    targetId: "usr_example",
    targetType: "user",
  },
  {
    action: "instance_admin.ops_test.send",
    actorEmail: "operator@example.com",
    createdAt: "2026-09-05T08:10:00.000Z",
    id: "audit_ops_send",
    result: "blocked",
    targetId: null,
    targetType: "instance_ops",
  },
] satisfies InstanceAdminAuditPage["entries"];

const providerUsage = [
  {
    billableUnits: 26,
    checks: 18,
    provider: "search",
    providerLabel: "Search provider",
    rateBasis: "Recorded request units",
    referenceCostCents: 156,
    referenceCostKnown: true,
  },
  {
    billableUnits: 10,
    checks: 8,
    provider: "fallback",
    providerLabel: "Fallback provider",
    rateBasis: "Live depth pricing",
    referenceCostCents: 42,
    referenceCostKnown: true,
  },
] satisfies InstanceAdminDashboard["stats"]["providerUsage"];

const consumption = [
  {
    billableUnits: 120,
    checks: 94,
    projectId: "project_example",
    provider: "search",
    providerLabel: "Search provider",
    rateBasis: "Recorded request units",
    referenceCostCents: 612,
    referenceCostKnown: true,
    sharePercent: 61.2,
  },
  {
    billableUnits: 64,
    checks: 51,
    projectId: "project_secondary",
    provider: "fallback",
    providerLabel: "Fallback provider",
    rateBasis: "Live depth pricing",
    referenceCostCents: 388,
    referenceCostKnown: true,
    sharePercent: 38.8,
  },
] satisfies InstanceAdminAdministration["topConsumption"];

const opsEvents = [
  {
    attempts: 1,
    createdAt: "2026-09-05T08:25:00.000Z",
    deliveredAt: "2026-09-05T08:25:04.000Z",
    kind: "worker_started",
    severity: "info",
  },
  {
    attempts: 3,
    createdAt: "2026-09-05T08:15:00.000Z",
    deliveredAt: null,
    kind: "delivery_failed",
    severity: "error",
  },
] satisfies InstanceAdminDashboard["ops"]["events"];

const meta = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Admin/Tables",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuditActivity: Story = {
  render: () => <AdminAuditTable entries={auditEntries} filter="all" nextCursor={null} />,
};

export const ProviderUsage: Story = {
  render: () => (
    <Card size="lg">
      <SectionTitle>SERP usage</SectionTitle>
      <AdminProviderUsageTable usage={providerUsage} />
    </Card>
  ),
};

export const TopConsumption: Story = {
  render: () => (
    <Card size="lg">
      <SectionTitle>Top consumption</SectionTitle>
      <div className="mt-3 [&>[role=table]]:border-0">
        <AdminAdministrationConsumptionTable rows={consumption} />
      </div>
    </Card>
  ),
};

export const OperationalEvents: Story = {
  render: () => (
    <Card size="lg">
      <SectionTitle>Ops events</SectionTitle>
      <div className="mt-3 [&>[role=table]]:border-0">
        <AdminDashboardOpsEventsTable dateFormat="day_first" events={opsEvents} />
      </div>
    </Card>
  ),
};
