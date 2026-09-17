import { DomainOverviewPageLoading } from "@/components/domain-overview/DomainOverviewLoadingSkeletons";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

// The route's message boundary lives in page.tsx, and Next renders this fallback as its sibling.
// The root request config it would otherwise read carries `shared` alone, so the skeleton
// resolves the domain-overview catalog itself.
export default async function Loading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectDomainOverview"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <DomainOverviewPageLoading ariaLabel={t("projectDomainOverview.workspace.ui.pageLoading")} />
  );
}
