import { AiResearchWorkspace } from "@/components/ai-research/AiResearchWorkspace";
import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { ResearchBrandLookupNav } from "@/components/ai-tracking/ResearchBrandLookupNav";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiResearchPage } from "@/lib/actions/ai-research";

/** Brand and domain mentions stay on the existing lookup, inside the Research tab. */
export async function ResearchBrandLookup({ project }: Readonly<{ project: string }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const [data, messages] = await Promise.all([
    getAiResearchPage(project, "visibility"),
    loadCoreMessages(runtime.locale, ["shared", "projectAiResearch", "projectAiTracking"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent className="flex flex-col gap-5" variant="section">
        <AiVisibilityTabs active="research" projectId={project} />
        <ResearchBrandLookupNav projectId={project} />
        <AiResearchWorkspace
          canRun={data.canRun}
          catalog={data.catalog}
          catalogError={data.catalogError}
          catalogFailure={data.catalogFailure}
          domain={data.domain}
          history={data.history}
          mode="visibility"
          projectId={project}
          supportingProviders={data.supportingProviders}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
