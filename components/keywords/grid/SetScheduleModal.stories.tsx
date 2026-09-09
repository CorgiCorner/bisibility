import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { SetScheduleModal } from "./SetScheduleModal";
import type { CheckScheduleSummary } from "./set-schedule-model";

const schedules = [
  {
    cronExpression: null,
    enabled: true,
    frequency: "daily",
    isDefault: true,
    jitterMinutes: 60,
    keywordCount: 16,
    name: "Daily 06:00",
    publicId: "sch_daily",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
  {
    cronExpression: null,
    enabled: true,
    frequency: "weekly",
    isDefault: false,
    jitterMinutes: 60,
    keywordCount: 8,
    name: "Weekly Mon",
    publicId: "sch_weekly",
    serpDepth: null,
    timeOfDay: "06:00",
    timezone: "UTC",
  },
] satisfies CheckScheduleSummary[];

const meta = {
  title: "dashboard-keywords",
  component: SetScheduleModal,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SetScheduleModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  currentScheduleId: "sch_daily",
  onClose: () => undefined,
  onDone: () => undefined,
  open: true,
  projectId: "prj_schedule_story",
  providerRate: { overrideCents: 1, providerId: "dataforseo" },
  schedules,
  selectedRows: keywordRows.slice(0, 3),
};

export const OverlayBulkAction: Story = { args, name: "overlay-bulk-action" };
export const ModalSetSchedule: Story = { args, name: "modal-set-schedule" };
export const ModalSetScheduleUnassigned: Story = {
  args: {
    ...args,
    currentScheduleId: null,
    providerRate: undefined,
    schedules: [{ ...schedules[0], name: "Manual", frequency: "manual", timeOfDay: null }],
    selectedRows: [{ ...keywordRows[0], checkSchedule: null }],
  },
  name: "modal-set-schedule-unassigned",
};
export const ModalSetScheduleChosen: Story = {
  args: { ...args, initialChoice: "sch_weekly" },
  name: "modal-set-schedule-chosen",
};
export const ModalSetScheduleRemove: Story = {
  args: { ...args, initialChoice: "remove" },
  name: "modal-set-schedule-remove",
};
export const ModalSetScheduleLoading: Story = {
  args: { ...args, scheduleLoadState: "loading" },
  name: "modal-set-schedule-loading",
};
export const ModalSetScheduleLoadError: Story = {
  args: {
    ...args,
    scheduleLoadError: "Could not load schedules. Try again.",
    scheduleLoadState: "error",
  },
  name: "modal-set-schedule-load-error",
};
export const ModalNewScheduleFromSelection: Story = {
  args: { ...args, initialView: "new" },
  name: "modal-new-schedule-from-selection",
};
