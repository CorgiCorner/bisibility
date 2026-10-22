import { AdminShell } from "@/components/admin/AdminShell";
import { DangerousActionAccessProvider } from "@/components/admin/DangerousActionGate";
import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { adminDangerousActionAllowed } from "@/lib/auth/admin-dangerous-action";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { adminNavigationExtension } from "@/lib/instance-admin/navigation-extension";
import type { ReactNode } from "react";

export default async function InstanceAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireInstanceAdmin();
  const dangerousActionsAllowed = await adminDangerousActionAllowed(session);
  const [runtime, dateFormat] = await Promise.all([
    resolveRegionalDocumentLocale(),
    getResolvedDateFormat(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "instanceAdmin", "account"]);

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <DateFormatProvider value={dateFormat.resolved}>
        <DateDisplayProvider>
          <DangerousActionAccessProvider allowed={dangerousActionsAllowed}>
            <AdminShell extraTabs={adminNavigationExtension(runtime.locale)}>{children}</AdminShell>
          </DangerousActionAccessProvider>
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}
