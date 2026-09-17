import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

// Keep route loading geometry in lockstep with the keyword-detail Storybook skeleton.
export default async function KeywordDetailLoading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["projectRankTracker"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return (
    <PageContent>
      <KeywordDetailPageSkeleton
        ariaLabel={t("projectRankTracker.keywordDetail.loading.ariaLabel")}
      />
    </PageContent>
  );
}
