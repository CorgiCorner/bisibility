import { ThemeRoot } from "@/components/ui/ThemeRoot";
import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleEditorMembers } from "./ScheduleEditorMembers";

const meta = {
  title: "dashboard-schedule-editor-members",
  component: ScheduleEditorMembers,
  parameters: { chromatic: { viewports: [375, 768, 1024] }, layout: "fullscreen" },
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
    memberCount: 2,
    onOpenDrawer: () => undefined,
    pendingMembers: [
      {
        name: "static site generator",
        pending: true,
        publicId: "kw_pending",
        sourceName: "Daily 06:00",
        targetCount: 2,
      },
    ],
    scheduleName: "Commercial daily",
    storedMembers: [{ name: "api first cms", publicId: "kw_stored", targetCount: 3 }],
  },
} satisfies Meta<typeof ScheduleEditorMembers>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const Empty: Story = {
  name: "empty",
  args: { memberCount: 0, pendingMembers: [], storedMembers: [] },
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
