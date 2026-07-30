import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import type { Meta, StoryObj } from "@storybook/react";
import { NotificationPreferences } from "./NotificationPreferences";

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
  projectId: "prj_story",
  reportEmail: true,
  slackAvailable: false,
  webhookAvailable: false,
};

const meta = {
  component: NotificationPreferences,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[780px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Settings/Notification preferences",
} satisfies Meta<typeof NotificationPreferences>;

export default meta;

type Story = StoryObj<typeof meta>;

export const VerifiedEmail: Story = {
  args: { canEdit: true, preferences },
};
