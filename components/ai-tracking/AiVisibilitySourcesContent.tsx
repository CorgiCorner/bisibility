import { AiVisibilitySources } from "@/components/ai-tracking/AiVisibilitySources";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiVisibilitySources } from "@/lib/actions/ai-sources";
import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";

export async function AiVisibilitySourcesContent({
  project,
  query,
}: Readonly<{ project: string; query: AiVisibilityQuery }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const [model, messages] = await Promise.all([
    getAiVisibilitySources(project, query),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <AiVisibilitySources model={model} projectId={project} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
