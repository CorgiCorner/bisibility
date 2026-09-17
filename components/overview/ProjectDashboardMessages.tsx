import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { AppLocale } from "@/i18n/config";
import type { DateFormat } from "@/lib/dates/format";
import dashboardMessages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";

const dashboardTestMessages = mergeMessageCatalogs(sharedMessages, dashboardMessages);

/** Story and unit-test boundary for the exact shared and dashboard payload. */
export function ProjectDashboardMessages({
  children,
  dateFormat = "month_first",
  locale = "en",
  messages = dashboardTestMessages,
  timeZone = "UTC",
}: Readonly<{
  children: ReactNode;
  dateFormat?: DateFormat;
  locale?: AppLocale;
  messages?: AbstractIntlMessages;
  timeZone?: string;
}>) {
  return (
    <FeatureMessagesProvider locale={locale} messages={messages} timeZone={timeZone}>
      <DateFormatProvider value={dateFormat}>
        <DateDisplayProvider>{children}</DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}
