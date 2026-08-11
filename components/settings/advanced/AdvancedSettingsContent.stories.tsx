import { AdvancedSettingsContent } from "@/components/settings/advanced/AdvancedSettingsContent";
import {
  AdvancedSettingsContentLoading,
  AdvancedSettingsLoading,
} from "@/components/settings/advanced/AdvancedSettingsLoading";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { AuditEntry } from "@/lib/queries/audit";
import type { Meta, StoryObj } from "@storybook/react";

const projectId = "prj_story";
const packageFile = {
  content: "{}",
  counts: {
    alertRules: 2,
    competitors: 3,
    keywords: 248,
    notificationPreferences: 1,
    rankChecks: 9412,
    savedViews: 4,
  },
  filename: "example-project.json",
  mimeType: "application/json",
};
const activeMigration = {
  autoReleasesAt: null,
  canRollback: false,
  startedAt: null,
  writeMode: "active" as const,
};
const heldMigration = {
  autoReleasesAt: "2026-08-10T14:30:00.000Z",
  canRollback: true,
  startedAt: "2026-08-09T08:30:00.000Z",
  writeMode: "migration_hold" as const,
};

function auditEntry(index: number): AuditEntry {
  const timestamp = `2026-08-09T0${index + 1}:30:00.000Z`;
  return {
    actor: {
      email: index === 4 ? "system@example.org" : "owner@example.com",
      id: index === 4 ? "system" : "usr_story",
      initials: index === 4 ? "//" : "AO",
      name: index === 4 ? "System" : "Alex Owner",
    },
    diff: [],
    eventName:
      [
        "Provider API key updated",
        "Keywords imported",
        "Project defaults updated",
        "CSV export completed",
        "Scheduled check completed",
      ][index] ?? "Project updated",
    eventType: "data",
    id: `audit_${index}`,
    metadata: {
      app_version: "0.6.1",
      correlation_id: "Not recorded",
      event_id: `audit_${index}`,
      user_agent: "Storybook",
    },
    operation: "UPDATE",
    resource: { id: projectId, name: projectId, type: "project" },
    source: { channel: "ui", ip: "Not recorded" },
    status: "success",
    timestamp,
    timestampLabel: `9 Aug 2026, 0${index + 1}:30`,
  };
}

const auditEntries = Array.from({ length: 5 }, (_, index) => auditEntry(index));
const actions = {
  cancelMigration: async () => ({ writeMode: "active" }),
  deleteProject: async () => ({
    hasRemainingWorkspace: false,
    id: projectId,
    nextProjectPublicId: null,
  }),
  enableMigrationHold: async () => ({ writeMode: "migration_hold" }),
  exportBackup: async () => packageFile,
  markProjectMigrated: async () => ({ writeMode: "migrated" }),
  reactivateProject: async () => ({ writeMode: "active" }),
  releaseMigrationHold: async () => ({ writeMode: "active" }),
  rollbackHostedMigration: async () => activeMigration,
  startHostedMigration: async () => ({ migration: heldMigration, packageFile }),
};
const commonArgs = {
  actions,
  auditEntries,
  canDeleteProject: true,
  canManageMigration: true,
  defaultMigrationTargetOrigin: "https://cloud.example.com",
  project: {
    domain: "example.com",
    name: "Example project",
    projectId,
    writeMode: "active" as const,
  },
};

const meta = {
  component: AdvancedSettingsContent,
  decorators: [
    (Story, context) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        {context.parameters.settingsRouteLoading ? (
          <Story />
        ) : (
          <SettingsShell activeSection="advanced" projectRef={projectId}>
            <Story />
          </SettingsShell>
        )}
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Advanced",
} satisfies Meta<typeof AdvancedSettingsContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateSelfHostedInstance: Story = {
  args: { ...commonArgs, deployment: "self-host", migration: null },
  name: "STATE · self-hosted instance",
};

export const StateHostedBetaAccount: Story = {
  args: {
    ...commonArgs,
    deployment: "cloud",
    migration: heldMigration,
    project: { ...commonArgs.project, writeMode: "migration_hold" },
  },
  name: "STATE · hosted beta account",
};

export const StateDomainSet: Story = {
  args: { ...commonArgs, deployment: "cloud", migration: activeMigration },
  name: "STATE · domain set",
};

export const StateNoDomain: Story = {
  args: {
    ...commonArgs,
    deployment: "cloud",
    migration: activeMigration,
    project: { ...commonArgs.project, domain: "" },
  },
  name: "STATE · no domain",
};

export const Loading: Story = {
  args: { ...commonArgs, deployment: "cloud", migration: activeMigration },
  render: () => <AdvancedSettingsContentLoading />,
};

export const RouteLoading: Story = {
  args: { ...commonArgs, deployment: "cloud", migration: activeMigration },
  name: "Route loading",
  parameters: { settingsRouteLoading: true },
  render: () => <AdvancedSettingsLoading />,
};
