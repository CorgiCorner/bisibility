import { withNotificationSettingsMessages } from "@/.storybook/notification-settings-messages";
import {
  NotificationPreferences,
  type NotificationPreferencesProps,
} from "@/components/settings/notifications/NotificationPreferences";
import {
  NotificationsLoading,
  NotificationsRouteLoading,
} from "@/components/settings/notifications/NotificationsLoading";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import type { Meta, StoryObj } from "@storybook/react";

const projectRef = "prj_story";

const preferences: NotificationPreferencesView = {
  alertEmail: true,
  alertInApp: true,
  alertPush: true,
  alertSlack: false,
  alertWebhook: false,
  checkEmail: false,
  checkInApp: true,
  checkNotificationSetting: "important",
  checkNotificationTopN: 10,
  checkNotificationPositionMove: 5,
  email: "owner@example.com",
  emailVerification: "verified",
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  projectId: projectRef,
  reportEmail: true,
  slackAvailable: false,
  webhookAvailable: false,
};

function NotificationPreferencesStory({
  canEdit,
  preferences: storyPreferences,
}: Readonly<NotificationPreferencesProps>) {
  return (
    <div data-notifications-story="settled">
      <SettingsShell activeSection="notifications" projectRef={projectRef}>
        <NotificationPreferences canEdit={canEdit} preferences={storyPreferences} />
      </SettingsShell>
    </div>
  );
}

const meta = {
  component: NotificationPreferences,
  decorators: [
    withNotificationSettingsMessages,
    (Story) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Notification preferences",
} satisfies Meta<typeof NotificationPreferences>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Settled: Story = {
  args: { canEdit: true, preferences },
  render: (args) => <NotificationPreferencesStory {...args} />,
};

export const VerifiedEmail: Story = {
  args: { canEdit: true, preferences },
  render: (args) => <NotificationPreferencesStory {...args} />,
};

export const UnverifiedEmail: Story = {
  args: {
    canEdit: true,
    preferences: {
      ...preferences,
      email: "unverified@example.com",
      emailVerification: "unverified",
    },
  },
  render: (args) => <NotificationPreferencesStory {...args} />,
};

export const Loading: Story = {
  args: { canEdit: true, preferences },
  render: () => (
    <div data-notifications-story="loading">
      <SettingsShell activeSection="notifications" projectRef={projectRef}>
        <NotificationsLoading />
      </SettingsShell>
    </div>
  ),
};

export const RouteLoading: Story = {
  args: { canEdit: true, preferences },
  name: "Route loading",
  render: () => <NotificationsRouteLoading />,
};

export const AllChecks: Story = {
  args: { canEdit: true, preferences: { ...preferences, checkNotificationSetting: "all" } },
};
export const ImportantChecks: Story = { args: { canEdit: true, preferences } };
export const NoChecks: Story = {
  args: { canEdit: true, preferences: { ...preferences, checkNotificationSetting: "none" } },
};
export const IncidentsOff: Story = {
  args: { canEdit: true, preferences: { ...preferences, providerIncidentInApp: false } },
};
export const ThresholdErrors: Story = {
  args: { canEdit: true, preferences },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: /Top-N|top N|上位 N/ });
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.tab();
  },
};
