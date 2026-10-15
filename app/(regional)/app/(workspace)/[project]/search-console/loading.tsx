import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SearchInsightsPageLoading } from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function Loading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectSearchInsights"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      timeZone={runtime.timeZone}
      messages={messages}
    >
      <SearchInsightsPageLoading
        bodyAriaLabel={t("projectSearchInsights.copy.searchInsightsDataLoading")}
        pageAriaLabel={t("projectSearchInsights.copy.searchInsightsPageLoading")}
      />
    </FeatureMessagesProvider>
  );
}
