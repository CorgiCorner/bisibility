import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
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
