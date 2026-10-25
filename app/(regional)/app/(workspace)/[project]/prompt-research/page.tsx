import { PromptResearchClient } from "@/components/ai-tracking/PromptResearchClient";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { getPromptResearchPage } from "@/lib/actions/prompt-research";
import { AuthorizationError } from "@/lib/auth/authorize";
import { notFound } from "next/navigation";

export default async function PromptResearchPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const query = await searchParams;
  const keyword = typeof query.q === "string" ? query.q.trim() : "";
  const [data, messages] = await Promise.all([
    getPromptResearchPage(project, keyword).catch((error: unknown) => {
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
      <PageContent variant="section">
        <PromptResearchClient key={keyword} projectId={project} keyword={keyword} data={data} />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
