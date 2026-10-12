import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectContextForm } from "@/components/project-context/ProjectContextForm";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { saveProjectContextAction } from "@/lib/actions/agent-workspace";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getProjectContextPage } from "@/lib/queries/agent-workspace";
import { asProjectRef } from "@/lib/routing/app-path";

export default async function ProjectContextPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const access = await resolveProjectAccess(project);
  const [context, messages] = await Promise.all([
    getProjectContextPage(access.publicId),
    loadCoreMessages(runtime.locale, ["shared", "agentWorkspace", "projectSettingsShell"]),
  ]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <SettingsShell activeSection="context" projectRef={asProjectRef(access.publicId)}>
        <ProjectContextForm
          {...context}
          projectId={access.publicId}
          saveAction={saveProjectContextAction}
        />
      </SettingsShell>
    </FeatureMessagesProvider>
  );
}
