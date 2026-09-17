import { SearchInsightsPageLoading } from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function Loading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["projectSearchInsights"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return (
    <SearchInsightsPageLoading
      bodyAriaLabel={t("projectSearchInsights.copy.searchInsightsDataLoading")}
      pageAriaLabel={t("projectSearchInsights.copy.searchInsightsPageLoading")}
    />
  );
}
