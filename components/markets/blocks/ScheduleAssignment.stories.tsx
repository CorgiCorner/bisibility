import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleAssignment } from "./ScheduleAssignment";

const meta = {
  component: ScheduleAssignment,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Markets/Blocks/ScheduleAssignment",
} satisfies Meta<typeof ScheduleAssignment>;

export default meta;
type Story = StoryObj<typeof meta>;

const schedules = [
  { costPerCheckCents: 50, frequency: "daily" as const, id: "daily", name: "Daily" },
  { costPerCheckCents: 0, frequency: "manual" as const, id: "manual", name: "Manual" },
];

export const Empty: Story = {
  args: { fixed: 1, keywordCount: 1, onChange: () => {}, schedules: [], selectedId: null },
};

export const Scheduled: Story = {
  args: { fixed: 2, keywordCount: 1, onChange: () => {}, schedules, selectedId: "daily" },
};

export const Manual: Story = {
  args: { fixed: 1, keywordCount: 1, onChange: () => {}, schedules, selectedId: "manual" },
};

export const WithNewSchedule: Story = {
  args: {
    fixed: 1,
    keywordCount: 1,
    onChange: () => {},
    onNewSchedule: () => {},
    schedules,
    selectedId: "daily",
  },
};

export const ErrorState: Story = {
  args: { fixed: 0, keywordCount: 0, onChange: () => {}, schedules, selectedId: "missing" },
};
