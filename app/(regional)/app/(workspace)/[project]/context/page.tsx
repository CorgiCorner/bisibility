import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectContextForm } from "@/components/project-context/ProjectContextForm";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { saveProjectContextAction } from "@/lib/actions/agent-workspace";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getProjectContextPage } from "@/lib/queries/agent-workspace";

export default async function ProjectContextPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const access = await resolveProjectAccess(project);
  const [context, messages] = await Promise.all([
    getProjectContextPage(access.publicId),
    loadCoreMessages(runtime.locale, ["shared", "agentWorkspace"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="form">
        <ProjectContextForm
          {...context}
          projectId={access.publicId}
          saveAction={saveProjectContextAction}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
