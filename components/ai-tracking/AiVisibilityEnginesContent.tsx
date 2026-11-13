import { AiVisibilityEnginesView } from "@/components/ai-tracking/AiVisibilityEnginesView";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiVisibilityEngines, setAiProjectEngine } from "@/lib/actions/ai-project-engines";
import { appPath, asProjectRef } from "@/lib/routing/app-path";

export async function AiVisibilityEnginesContent({ project }: Readonly<{ project: string }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const [model, messages] = await Promise.all([
    getAiVisibilityEngines(project),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking"]),
  ]);
  const ref = asProjectRef(project);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <AiVisibilityEnginesView
          model={model}
          onToggle={setAiProjectEngine}
          projectId={project}
          providersHref={appPath(ref, "providers")}
          rankHref={`${appPath(ref, "rank-tracker")}?reportView=ai_overviews`}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
