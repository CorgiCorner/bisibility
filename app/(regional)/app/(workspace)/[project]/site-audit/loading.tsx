import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SiteAuditPageLoading } from "@/components/site-audit/SiteAuditLoading";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
export default async function Loading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectSiteAudit"]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      timeZone={runtime.timeZone}
      messages={messages}
    >
      <SiteAuditPageLoading />
    </FeatureMessagesProvider>
  );
}
