import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleCell, type ScheduleCellTarget } from "./ScheduleCell";

const daily = { name: "Daily 06:00", publicId: "sch_daily" };
const weekly = { name: "Weekly Mon", publicId: "sch_weekly" };

function target(overrides: Partial<ScheduleCellTarget>): ScheduleCellTarget {
  return {
    device: "Desktop",
    id: "kw_a00000000000000000000000",
    location: "Spain / Spanish",
    schedule: daily,
    ...overrides,
  };
}

const meta = {
  title: "Keywords/ScheduleCell",
  component: ScheduleCell,
  decorators: [
    (Story) => (
      <div className="min-h-[140px] bg-bg p-6 text-fg">
        <div className="w-[148px] rounded-card border border-border bg-bg-elev p-4">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduleCell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { targets: [target({})] },
  name: "default",
};

export const PauseScheduleTrue: Story = {
  args: { targets: [target({ schedule: null })] },
  name: "pauseschedule-true",
};

export const ThemeDark: Story = {
  args: {
    targets: [
      target({}),
      target({
        device: "Mobile",
        id: "kw_b00000000000000000000000",
        schedule: weekly,
      }),
    ],
  },
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
  name: "theme-dark",
};
