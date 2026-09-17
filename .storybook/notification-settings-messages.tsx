import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsNotificationsMessages from "@/messages/core/en/project-settings-notifications.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

const notificationSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsNotificationsMessages,
);

/** Notification stories replace the shared shell payload with their exact route payload. */
export const withNotificationSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={notificationSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <Story />
  </FeatureMessagesProvider>
);
