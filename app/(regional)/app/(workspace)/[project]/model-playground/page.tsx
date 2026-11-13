import { ModelPlayground } from "@/components/ai-research/ModelPlayground";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getModelPlaygroundPage } from "@/lib/actions/model-playground";

// Provider work has a 260-second aggregate budget, leaving time to settle usage and save results.
export const maxDuration = 300;

export default async function ModelPlaygroundPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const [data, messages] = await Promise.all([
    getModelPlaygroundPage(project),
    loadCoreMessages(runtime.locale, [
      "shared",
      "projectAiResearch",
      "projectAiTracking",
      "researchHistory",
    ]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="section">
        <ModelPlayground
          canRun={data.canRun}
          canTrack={data.canTrack}
          catalog={data.catalog}
          catalogError={data.catalogError}
          catalogFailure={data.catalogFailure}
          domain={data.domain}
          engineOptions={data.engineOptions}
          entities={data.entities}
          projectId={project}
          projectName={data.projectName}
          sourceOverrides={data.sourceOverrides}
          supportingProviders={data.supportingProviders}
          topics={data.topics}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
