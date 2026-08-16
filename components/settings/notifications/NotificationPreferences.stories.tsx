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
  alertSlack: false,
  alertWebhook: false,
  checkEmail: false,
  checkInApp: true,
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
