import {
  type DefaultsData,
  type RankCheckFrequency as Frequency,
  settingsFixtures,
} from "@/components/settings/settings-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { RankCheckFrequency } from "./RankCheckFrequency";

const meta = {
  title: "Settings/RankCheckFrequency",
  component: RankCheckFrequency,
  decorators: [
    (Story) => (
      <div className="min-h-[420px] bg-bg p-6 text-fg">
        <div className="mx-auto max-w-[720px] rounded-[14px] border border-border bg-bg-elev p-5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof RankCheckFrequency>;

export default meta;

type Story = StoryObj<typeof meta>;

function defaultsFor(
  frequency: Frequency,
  cronExpression: string | null,
  timezone: string = settingsFixtures.defaults.schedule.timezone,
): DefaultsData {
  return {
    ...settingsFixtures.defaults,
    schedule: {
      ...settingsFixtures.defaults.schedule,
      cron_expression: cronExpression,
      frequency,
      timezone,
      next_check_at:
        frequency === "manual" || frequency === "paused" ? null : "2026-06-19T06:00:00.000Z",
    },
  };
}

export const Daily: Story = {
  args: {
    defaults: defaultsFor("daily", "0 6 * * *"),
  },
};

export const Manual: Story = {
  args: {
    defaults: defaultsFor("manual", null),
  },
};

export const Paused: Story = {
  args: {
    defaults: defaultsFor("paused", null),
  },
};

export const CustomCron: Story = {
  args: {
    defaults: defaultsFor("custom_cron", "0 6 * * *"),
  },
};

export const CustomCronWithLegacyTimezone: Story = {
  args: {
    defaults: defaultsFor("custom_cron", "0 6 * * *", "Legacy/Project_Time"),
  },
};
