import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SerpPlayground } from "@/components/keywords/serp-playground/SerpPlayground";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getSerpPlaygroundPage } from "@/lib/actions/serp-playground";

export const maxDuration = 60;
export default async function SerpPlaygroundPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const [data, messages] = await Promise.all([
    getSerpPlaygroundPage(project),
    loadCoreMessages(runtime.locale, ["shared", "projectRankTracker"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <SerpPlayground projectRef={project} data={data} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
