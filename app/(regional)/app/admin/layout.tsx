import { AdminShell } from "@/components/admin/AdminShell";
import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { adminNavigationExtension } from "@/lib/instance-admin/navigation-extension";
import type { ReactNode } from "react";

export default async function InstanceAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireInstanceAdmin();
  const [runtime, dateFormat] = await Promise.all([
    resolveRegionalDocumentLocale(),
    getResolvedDateFormat(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "instanceAdmin"]);

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <DateFormatProvider value={dateFormat.resolved}>
        <DateDisplayProvider>
          <AdminShell extraTabs={adminNavigationExtension(runtime.locale)}>{children}</AdminShell>
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}
