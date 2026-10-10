import { AiTrackingClient } from "@/components/ai-tracking/AiTrackingClient";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiTrackingPage } from "@/lib/actions/ai-tracking";
export default async function AiTrackingPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const [data, messages] = await Promise.all([
    getAiTrackingPage(project),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        <AiTrackingClient projectId={project} data={data} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
