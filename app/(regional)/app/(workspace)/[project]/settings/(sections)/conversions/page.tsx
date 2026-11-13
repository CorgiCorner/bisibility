import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ConversionsSettings } from "@/components/settings/conversions/ConversionsSettings";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import {
  setPrimaryConversionSource,
  syncConversionSource,
  updateConversionGoal,
} from "@/lib/actions/conversions";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getConversionsSettings } from "@/lib/conversions/queries";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { requireReadableProject } from "@/lib/queries/_auth";
import { appPath, asProjectRef } from "@/lib/routing/app-path";

type ConversionsSettingsPageProps = { params: Promise<{ project: string }> };

export default async function ConversionsSettingsPage({
  params,
}: Readonly<ConversionsSettingsPageProps>) {
  const { project: projectRef } = await params;
  const { actor, project } = await requireReadableProject(projectRef);
  const runtime = await resolveRegionalDocumentLocale();
  const [model, messages] = await Promise.all([
    getConversionsSettings(project.id),
    loadCoreMessages(runtime.locale, [
      "shared",
      "projectSettingsShell",
      "projectSettingsConversions",
    ]),
  ]);
  const role = getProjectRole(actor, project.id);
  const canEdit =
    !isProjectReadOnly(project.writeMode) && canProjectAction(role, "update", "project_defaults");

  return (
    <SettingsShell activeSection="conversions" projectRef={asProjectRef(project.publicId)}>
      <div data-settings-section-slot="conversions">
        <FeatureMessagesProvider
          locale={runtime.locale}
          messages={messages}
          timeZone={runtime.timeZone}
        >
          <ConversionsSettings
            actions={{
              setPrimary: setPrimaryConversionSource,
              syncSource: syncConversionSource,
              updateGoal: updateConversionGoal,
            }}
            canEdit={canEdit}
            connectHref={appPath(asProjectRef(project.publicId), "settings", "data-sources")}
            model={model}
            projectId={project.publicId}
          />
        </FeatureMessagesProvider>
      </div>
    </SettingsShell>
  );
}
