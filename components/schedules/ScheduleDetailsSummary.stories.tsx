import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import projectRunsMessages from "@/messages/core/en/project-runs-schedules.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleDetailsSummary } from "./ScheduleDetailsSummary";

const messages = mergeMessageCatalogs(sharedMessages, projectRunsMessages);
const schedule = {
  enabled: true,
  frequency: "weekly" as const,
  isDefault: true,
  keywordCount: 2,
  name: "Weekly",
  nativeEstimate: { providerId: "serpapi", quantity: 2, unit: "units" as const, unknownTargets: 0 },
  nextRunAt: "2026-10-26T00:00:00.000Z",
  publicId: "sch_summary",
  timeOfDay: null,
  timezone: "UTC",
};
const meta = {
  title: "Schedules/Details summary",
  component: ScheduleDetailsSummary,
  args: {
    canEdit: true,
    canManage: true,
    projectId: "prj_summary",
    schedule,
    schedules: [schedule],
  },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <div className="bg-bg p-4 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ScheduleDetailsSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DistributedWeekly: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Paused: Story = { args: { schedule: { ...schedule, enabled: false } } };
