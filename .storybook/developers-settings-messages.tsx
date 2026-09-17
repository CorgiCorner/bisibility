import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsDevelopersMessages from "@/messages/core/en/project-settings-developers.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

const developersSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsDevelopersMessages,
);

/** Developers stories replace the shared shell payload with their exact route payload. */
export const withDevelopersSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={developersSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);
