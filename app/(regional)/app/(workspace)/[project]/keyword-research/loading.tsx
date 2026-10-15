import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ResearchPageLoading } from "@/components/research/ResearchLoadingSkeletons";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
export default async function ResearchLoading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectResearch"]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      timeZone={runtime.timeZone}
      messages={messages}
    >
      <ResearchPageLoading />
    </FeatureMessagesProvider>
  );
}
