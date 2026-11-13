import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { shiftDay } from "@/lib/achievements/calendar";
import { progressForThirtyDays } from "@/lib/achievements/thirty-days";
import account from "@/messages/core/en/account.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AchievementsPanel } from "./AchievementsPanel";

const meta = {
  title: "Account/Activity",
  component: AchievementsPanel,
  parameters: { nextjs: { appDirectory: true }, layout: "fullscreen", themeControls: false },
  decorators: [
    (Story, context) => (
      <FeatureMessagesProvider locale="en" messages={{ ...account, ...shared }} timeZone="UTC">
        <div
          data-theme={context.parameters.activityTheme ?? "light"}
          className="h-dvh overflow-y-auto overscroll-contain bg-bg text-fg px-3 py-5 sm:px-5 sm:py-6"
        >
          <main className="mx-auto max-w-4xl">
            <Story />
          </main>
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AchievementsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
const view = {
  available: true,
  enabled: true,
  showHeader: true,
  emailEnabled: true,
  timeZone: "Europe/Warsaw",
  epoch: 1,
  revision: 0,
  today: "2026-10-16",
  presence: {
    current: 7,
    longest: 7,
    days: [
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ],
  },
  practice: {
    current: 4,
    longest: 4,
    days: ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  },
  awards: [
    {
      kind: "presence" as const,
      earnedAt: "2026-10-16T10:00:00Z",
      earnedDay: "2026-10-16",
      published: false,
    },
  ],
};
export const Progress: Story = { args: { view } };
export const FirstVisit: Story = {
  args: {
    view: {
      ...view,
      presence: { current: 1, longest: 1, days: ["2026-10-16"] },
      practice: { current: 0, longest: 0, days: [] },
      awards: [],
    },
  },
};

export const DarkProgress: Story = { args: { view }, parameters: { activityTheme: "dark" } };

const projects = [{ publicId: "prj_examplepagesnapshot", name: "Example" }];
const emptyChallenge = {
  joinedOn: null,
  leftOn: null,
  dayNumber: 0,
  earned: false,
  paused: false,
  overflowDays: 0,
  slots: [],
};
function challenge(progress: ReturnType<typeof progressForThirtyDays>) {
  return {
    joinedOn: progress.joinedOn,
    leftOn: progress.leftOn,
    dayNumber: progress.dayNumber,
    earned: progress.earned,
    paused: progress.paused,
    overflowDays: progress.overflowDays,
    slots: progress.slots,
  };
}
const dayThree = progressForThirtyDays({
  joinedOn: "2026-11-07",
  leftOn: null,
  practiceDays: ["2026-11-07", "2026-11-08", "2026-11-10"],
  today: "2026-11-10",
});
const earned = progressForThirtyDays({
  joinedOn: "2026-10-01",
  leftOn: null,
  practiceDays: Array.from({ length: 30 }, (_, index) => shiftDay("2026-10-01", index)),
  today: "2026-10-30",
});
export const ThirtyDaysNotJoined: Story = {
  args: { view: { ...view, snapshotProjects: projects, thirtyDays: emptyChallenge } },
};
export const ThirtyDaysDayThree: Story = {
  args: {
    view: {
      ...view,
      today: "2026-11-10",
      snapshotProjects: projects,
      thirtyDays: challenge(dayThree),
    },
  },
};
export const ThirtyDaysEarned: Story = {
  args: {
    view: {
      ...view,
      today: "2026-10-30",
      snapshotProjects: projects,
      thirtyDays: challenge(earned),
      awards: [
        ...view.awards,
        {
          kind: "thirty_days",
          earnedAt: "2026-10-30T12:00:00Z",
          earnedDay: "2026-10-30",
          published: false,
        },
      ],
    },
  },
};
