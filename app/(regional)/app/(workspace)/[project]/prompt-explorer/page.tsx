import { AiResearchWorkspace } from "@/components/ai-research/AiResearchWorkspace";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getAiResearchPage } from "@/lib/actions/ai-research";
// Provider work has a 40-second aggregate budget, leaving time to settle usage and save results.
export const maxDuration = 60;

export default async function PromptExplorerPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const [data, messages] = await Promise.all([
    getAiResearchPage(project, "prompt"),
    loadCoreMessages(runtime.locale, ["shared", "projectAiResearch"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        <AiResearchWorkspace
          projectId={project}
          mode="prompt"
          domain={data.domain}
          history={data.history}
          canRun={data.canRun}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
