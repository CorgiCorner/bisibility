import { ThemeRoot } from "@/components/ui/ThemeRoot";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { type ScheduleListRow, SchedulesList } from "./SchedulesList";

const schedules: ScheduleListRow[] = [
  {
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    enabled: true,
    frequency: "daily",
    isDefault: true,
    keywordCount: 248,
    memberMeta: "2 markets x 1 device",
    name: "Daily 06:00",
    nextRunLabel: "tomorrow 06:00",
    perRunCents: 298,
    publicId: "sch_daily",
    targetCount: 496,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    blocked: true,
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    enabled: true,
    frequency: "daily",
    isDefault: false,
    keywordCount: 350,
    memberMeta: "2 markets x 1 device",
    name: "Commercial daily",
    nextRunLabel: "tomorrow 06:00",
    perRunCents: 420,
    publicId: "sch_commercial",
    tagScope: "tag = commercial",
    targetCount: 700,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
  },
  {
    cadenceMeta: "Europe/Madrid / starts within 15 min of 06:00",
    enabled: true,
    frequency: "weekly",
    isDefault: false,
    keywordCount: 12,
    memberMeta: "2 markets x 1 device",
    name: "Weekly Mon",
    nextRunLabel: "Mon 06:00",
    perRunCents: 14,
    publicId: "sch_weekly",
    targetCount: 24,
    timeOfDay: "06:00",
    timezone: "Europe/Madrid",
    weekday: "Monday",
  },
  {
    cadenceMeta: "Europe/Stockholm / exactly 06:00",
    enabled: false,
    frequency: "weekly",
    isDefault: false,
    keywordCount: 40,
    memberMeta: "2 markets x 1 device",
    name: "Nordics weekly",
    nextRunLabel: "-",
    perRunCents: 48,
    publicId: "sch_nordics",
    tagScope: "tag = nordics",
    targetCount: 80,
    timeOfDay: "06:00",
    timezone: "Europe/Stockholm",
    weekday: "Thursday",
  },
];

const resizeColumnLabels = ["Schedule", "Cadence", "Members", "Per run", "Next"] as const;

const meta = {
  title: "dashboard-schedules",
  component: SchedulesList,
  parameters: {
    chromatic: { viewports: [375, 768, 1024] },
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <ThemeRoot className="min-h-screen bg-bg p-5 text-fg" data-theme="light">
        <div className="mx-auto max-w-[1180px]">
          <Story />
        </div>
      </ThemeRoot>
    ),
  ],
  args: {
    canUpdate: true,
    canManage: true,
    projectId: "prj_story",
    projectRef: "prj_story",
    schedules,
  },
} satisfies Meta<typeof SchedulesList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const ProjectstateEmpty: Story = {
  name: "projectstate-empty",
  args: { schedules: [] },
};

export const ThemeDark: Story = {
  name: "theme-dark",
  decorators: [
    (Story) => (
      <ThemeRoot className="min-h-screen bg-bg p-5 text-fg" data-theme="dark">
        <div className="mx-auto max-w-[1180px]">
          <Story />
        </div>
      </ThemeRoot>
    ),
  ],
};

export const EditorExisting: Story = {
  name: "editor-existing",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Schedule status" })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "New schedule" })).toHaveFocus();

    for (const label of resizeColumnLabels) {
      await userEvent.tab();
      await expect(canvas.getByRole("separator", { name: `Resize ${label} column` })).toHaveFocus();
    }

    const row = canvas.getByRole("row", { name: /Daily 06:00/ });
    await userEvent.tab();
    await expect(row).toHaveFocus();

    const link = canvas.getByRole("link", { name: "Daily 06:00" });
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(link).toHaveAttribute("href", "/app/prj_story/runs/schedules/sch_daily");

    let clicks = 0;
    const preventNavigation = (event: MouseEvent) => {
      clicks += 1;
      event.preventDefault();
    };
    link.addEventListener("click", preventNavigation);
    await userEvent.keyboard("{Enter}");
    link.removeEventListener("click", preventNavigation);

    await expect(clicks).toBe(1);
  },
};

export const Archived: Story = {
  args: {
    status: "archived",
    schedules: [
      {
        ...schedules[0],
        archivedAt: "2026-09-08T17:00:00.000Z",
        enabled: false,
        isDefault: false,
        keywordCount: 0,
        targetCount: 0,
        nextRunLabel: null,
      },
    ],
  },
};
