import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import projectSettingsTrackingMessages from "@/messages/core/en/project-settings-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

const trackingSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsTrackingMessages,
);

/** Tracking stories replace the global shared-only payload with their exact route payload. */
export const withTrackingSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={trackingSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <Story />
  </FeatureMessagesProvider>
);
