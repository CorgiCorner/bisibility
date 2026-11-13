import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { PromptResearchClient } from "@/components/ai-tracking/PromptResearchClient";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { getPromptResearchPage } from "@/lib/actions/prompt-research";
import { loadResearchTabContext } from "@/lib/ai-research/research-tab-context";
import { AuthorizationError } from "@/lib/auth/authorize";
import { notFound } from "next/navigation";

export async function PromptResearchPageContent({
  keyword,
  moduleTabs = false,
  project,
}: Readonly<{
  keyword: string;
  moduleTabs?: boolean;
  project: string;
}>) {
  const runtime = await resolveRegionalDocumentLocale();
  const [data, context, messages] = await Promise.all([
    getPromptResearchPage(project, keyword).catch((error: unknown) => {
      if (
        error instanceof ProjectNotFoundError ||
        (error instanceof AuthorizationError && error.code === "forbidden")
      ) {
        notFound();
      }
      throw error;
    }),
    loadResearchTabContext(project).catch((error: unknown) => {
      if (
        error instanceof ProjectNotFoundError ||
        (error instanceof AuthorizationError && error.code === "forbidden")
      ) {
        notFound();
      }
      throw error;
    }),
    loadCoreMessages(runtime.locale, ["shared", "projectAiTracking", "projectAiResearch"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent
        className="flex min-w-0 flex-col gap-5"
        data-visibility-blocks={aiVisibilityBlocks.research.join(" ")}
        data-visibility-tab="research"
        variant="section"
      >
        {moduleTabs ? (
          <AiVisibilityTabs active="research" keyword={keyword || undefined} projectId={project} />
        ) : null}
        <PromptResearchClient
          context={context}
          data={data}
          key={keyword}
          keyword={keyword}
          projectId={project}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
