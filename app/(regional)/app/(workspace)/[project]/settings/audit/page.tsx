import { AuditLogView, AuditNotAuthorized } from "@/components/audit";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { resolveDateFormat } from "@/lib/dates/resolve";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getAuditLogView } from "@/lib/queries/audit";

type AuditSettingsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditSettingsPage({
  params: routeParams,
  searchParams,
}: Readonly<AuditSettingsPageProps>) {
  const [{ project }, runtime] = await Promise.all([routeParams, resolveRegionalDocumentLocale()]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectAudit"]);
  const { publicId } = await resolveProjectAccess(project);
  const [params, preferences] = await Promise.all([searchParams, getPreferences()]);
  const audit = await getAuditLogView(publicId, { dateRange: params?.range });
  if (!audit.authorized) {
    return (
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <PageContent variant="form">
          <AuditNotAuthorized />
        </PageContent>
      </FeatureMessagesProvider>
    );
  }

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="analytics">
        <AuditLogView
          dateRange={audit.dateRange}
          dateDisplay={{
            dateFormat: resolveDateFormat(preferences.dateFormat, runtime.locale),
            locale: runtime.locale,
            timeZone: runtime.timeZone,
          }}
          entries={audit.entries}
          entryLimit={audit.entryLimit}
          retentionDays={audit.retentionDays}
          truncated={audit.truncated}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
