import type { AuditEntry } from "@/lib/queries/audit";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { AuditLogView } from "./AuditLogView";

const entries = [
  {
    actor: { email: "auditor@example.com", id: "usr_audit", initials: "AU", name: "Auditor" },
    diff: [],
    eventName: "Provider connection updated",
    eventType: "system",
    id: "audit_provider",
    metadata: {
      app_version: "1.2.3",
      correlation_id: "corr_provider",
      event_id: "audit_provider",
      user_agent: "Example Browser",
    },
    operation: "UPDATE",
    resource: { id: "provider_1", name: "Primary provider", type: "provider" },
    source: { channel: "ui", ip: "203.0.113.0" },
    status: "success",
    timestamp: "2026-09-05T14:32:00.000Z",
    timestampLabel: "2026-09-05 14:32:00 UTC",
  },
  {
    actor: { email: "admin@example.com", id: "usr_admin", initials: "AD", name: "Admin" },
    diff: [],
    eventName: "Export failed",
    eventType: "export",
    id: "audit_export",
    metadata: {
      app_version: "1.2.3",
      correlation_id: "corr_export",
      event_id: "audit_export",
      user_agent: "Example Browser",
    },
    operation: "EXPORT",
    resource: { id: "export_1", name: "Monthly export", type: "export" },
    source: { channel: "api", ip: "203.0.113.1" },
    status: "failed",
    statusReason: "The export was unavailable.",
    timestamp: "2026-09-04T10:11:12.000Z",
    timestampLabel: "2026-09-04 10:11:12 UTC",
  },
] satisfies readonly AuditEntry[];

const meta = {
  args: { dateRange: "30d", entries, entryLimit: 200, retentionDays: 365, truncated: false },
  component: AuditLogView,
  decorators: [
    (Story, context) => (
      <main
        className="min-h-screen bg-bg p-6 text-fg"
        data-theme={context.parameters.theme ?? "light"}
      >
        <div className="mx-auto max-w-[1180px]">
          <Story />
        </div>
      </main>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Settings/Audit log",
} satisfies Meta<typeof AuditLogView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const Empty: Story = { args: { entries: [] }, name: "emptystate-filtered" };

export const FilteredEmpty: Story = {
  name: "filterstate-empty",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search audit events" }), "missing");
    await expect(canvas.getByText("No audit events match")).toBeVisible();
  },
};

export const ThemeDark: Story = { name: "theme-dark", parameters: { theme: "dark" } };
