import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsAdvancedMessages from "@/messages/core/en/project-settings-advanced.json";
import projectSettingsExperimentalMessages from "@/messages/core/en/project-settings-experimental.json";
import projectSettingsMigrationMessages from "@/messages/core/en/project-settings-migration.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import projectSettingsUsageMessages from "@/messages/core/en/project-settings-usage.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

const settingsShellMessages = mergeMessageCatalogs(sharedMessages, projectSettingsShellMessages);

/** Settings stories replace the global shared-only payload with their route payload. */
export const withSettingsShellMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={settingsShellMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);

const usageSettingsMessages = mergeMessageCatalogs(
  settingsShellMessages,
  projectSettingsUsageMessages,
);
const advancedSettingsMessages = mergeMessageCatalogs(
  settingsShellMessages,
  projectSettingsAdvancedMessages,
  projectSettingsMigrationMessages,
);
const experimentalSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsExperimentalMessages,
);

export const withUsageSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={usageSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);

export const withAdvancedSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={advancedSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);

export const withExperimentalSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={experimentalSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);
