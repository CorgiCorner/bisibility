import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";

export const withSearchInsightsMessages: Decorator = (Story) => (
  <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
    <DateFormatProvider value="month_first">
      <DateDisplayProvider>
        <Story />
      </DateDisplayProvider>
    </DateFormatProvider>
  </FeatureMessagesProvider>
);
