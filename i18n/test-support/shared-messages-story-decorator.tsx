import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/react";

/** Gives isolated shared-control stories the same narrow English catalog as a document boundary. */
export const withSharedMessages: Decorator = (Story) => (
  <FeatureMessagesProvider
    locale={DEFAULT_LOCALE}
    messages={sharedMessages}
    timeZone={DEFAULT_TIME_ZONE}
  >
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);
