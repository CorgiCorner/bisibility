import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import projectSettingsTeamMessages from "@/messages/core/en/project-settings-team.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

const teamSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsTeamMessages,
);

/** Team stories replace the shared shell payload with their exact route payload. */
export const withTeamSettingsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={teamSettingsMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);
