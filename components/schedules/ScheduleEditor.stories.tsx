import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleEditor } from "./ScheduleEditor";
import type { ScheduleEditorProps } from "./ScheduleEditorModel";
import { ScheduleObjectFrame } from "./ScheduleObjectFrame";

const dailySchedule = {
  cronExpression: null,
  enabled: true,
  frequency: "daily" as const,
  isDefault: true,
  jitterMinutes: 15,
  keywordCount: 248,
  name: "Daily 06:00",
  providerPolicy: null,
  publicId: "sch_story_daily",
  serpDepth: null,
  timeOfDay: "06:00",
  timezone: null,
};

const base: ScheduleEditorProps = {
  candidates: [
    {
      device: "Desktop",
      market: "Spain",
      name: "api first cms",
      publicId: "kw_story_3",
      scheduleId: "sch_story_commercial",
      sourceName: "Commercial daily",
      tags: ["commercial"],
      targetCount: 2,
    },
    {
      device: "Mobile",
      market: "Spain",
      name: "static site generator",
      publicId: "kw_story_4",
      scheduleId: null,
      tags: [],
      targetCount: 2,
    },
  ],
  connectedProviders: [{ label: "SerpApi", value: "serpapi" }],
  defaultScheduleName: "Daily 06:00",
  members: [
    { name: "headless cms", publicId: "kw_story_1", targetCount: 2 },
    { name: "contentful alternative", publicId: "kw_story_2", targetCount: 2 },
    { name: "cms pricing", publicId: "kw_story_5", targetCount: 2 },
    { name: "best headless cms", publicId: "kw_story_6", targetCount: 2 },
    { name: "cms for ecommerce", publicId: "kw_story_7", targetCount: 2 },
  ],
  memberSummary: "248 keywords / 496 checks, ~$2.98 per run",
  projectId: "prj_story",
  projectDefaults: {
    provider: { label: "SerpApi", value: "serpapi" },
    serpDepth: 20,
  },
  projectTimezone: "Europe/Madrid",
  referenceIso: "2026-09-03T10:00:00.000Z",
  schedule: dailySchedule,
};

const meta = {
  args: base,
  component: ScheduleEditor,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-5 text-fg sm:p-6">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  render: (args) => (
    <ScheduleObjectFrame
      bodyLabel="Schedule editor"
      breadcrumb={{ href: "/app/prj_story/rank-tracker/schedules", label: "All schedules" }}
      subtitle={
        args.isNew
          ? "Not saved yet. It runs on its cadence once saved with at least one keyword."
          : `${args.schedule.frequency}, ${args.schedule.timeOfDay ?? "custom cron"} · ${args.schedule.publicId}`
      }
      title={args.schedule.name}
    >
      <ScheduleEditor {...args} />
    </ScheduleObjectFrame>
  ),
  title: "dashboard-schedules",
} satisfies Meta<typeof ScheduleEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SectionEditor: Story = {
  name: "section-editor",
  args: {},
};

export const EditorNew: Story = {
  name: "editor-new",
  args: {
    isNew: true,
    defaultScheduleName: null,
    members: [],
    memberSummary: undefined,
    schedule: {
      ...dailySchedule,
      isDefault: false,
      keywordCount: 0,
      name: "Daily 06:00",
      publicId: "new",
    },
  },
};

export const EditorFrequencyWeekly: Story = {
  name: "editor-frequency-weekly",
  args: {
    schedule: { ...dailySchedule, frequency: "weekly", isDefault: false, name: "Weekly Mon" },
  },
};

export const EditorFrequencyMonthly: Story = {
  name: "editor-frequency-monthly",
  args: {
    schedule: { ...dailySchedule, frequency: "monthly", isDefault: false, name: "Monthly 1st" },
  },
};

export const EditorFrequencyCron: Story = {
  name: "editor-frequency-cron",
  args: {
    schedule: {
      ...dailySchedule,
      cronExpression: "0 6 * * 1-5",
      frequency: "custom_cron",
      isDefault: false,
      name: "Custom - 0 6 * * 1-5",
      timezone: "Europe/Madrid",
    },
  },
};
