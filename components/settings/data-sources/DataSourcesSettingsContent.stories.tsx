import { DataSourcesSettingsContent } from "@/components/settings/data-sources/DataSourcesSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { DefaultsData } from "@/lib/settings/options";
import type { Meta, StoryObj } from "@storybook/react";

const projectId = "prj_7Kd2Qf9m";
const searchSync = {
  firstDataDate: null,
  firstDataDateLabel: null,
  lastQuotaPausedAt: null,
  newestFinalizedDate: "2026-08-29T00:00:00.000Z",
  pace: "normal" as const,
  plannedRemaining: 1240,
  requestsToday: 32,
  retentionMonths: 16 as const,
};
const defaults: DefaultsData = {
  city: null,
  costPerCheck: 0.0155,
  country: "Poland",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 100,
  keywordCount: 248,
  locationCount: 1,
  locationKey: "PL",
  locationLabel: "Poland",
  searchSync,
  schedule: {
    cron_expression: null,
    frequency: "daily",
    jitter_minutes: 60,
    last_checked_at: null,
    next_check_at: null,
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100,
  serpStopOnMatch: true,
  targetUrlCount: 42,
};
function renderContent(storyDefaults: DefaultsData) {
  return (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <SettingsShell activeSection="data-sources" projectRef={projectId}>
        <DataSourcesSettingsContent canEdit defaults={storyDefaults} projectId={projectId} />
      </SettingsShell>
    </main>
  );
}
const meta = {
  component: DataSourcesSettingsContent,
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Data sources",
} satisfies Meta<typeof DataSourcesSettingsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoQuotaPause: Story = {
  args: { canEdit: true, defaults, projectId },
  render: ({ defaults: value }) => renderContent(value),
};
export const ClampedHistory: Story = {
  args: {
    canEdit: true,
    defaults: {
      ...defaults,
      searchSync: {
        ...searchSync,
        firstDataDate: "2026-05-12T00:00:00.000Z",
        firstDataDateLabel: "May 12, 2026",
      },
    },
    projectId,
  },
  render: ({ defaults: value }) => renderContent(value),
};
