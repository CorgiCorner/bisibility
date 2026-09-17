import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { GeneralSettingsSection } from "@/components/settings/general/GeneralSettingsSection";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type GeneralSettingsPageProps = { params: Promise<{ project: string }> };

export default async function GeneralSettingsPage({ params }: Readonly<GeneralSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access, runtime] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsGeneral",
  ]);
  const projectRole = getProjectRole(access.actor, access.project.id);
  const writable = settings.project.writeMode === "active";
  const canEditProject = writable && canProjectAction(projectRole, "update", "project");
  const canCreateTags = writable && canProjectAction(projectRole, "create", "keyword");
  const canDeleteTags = writable && canProjectAction(projectRole, "delete", "keyword");

  return (
    <SettingsShell activeSection="general" projectRef={asProjectRef(access.project.publicId)}>
      <div data-settings-section-slot="general">
        <FeatureMessagesProvider
          locale={runtime.locale}
          messages={messages}
          timeZone={runtime.timeZone}
        >
          <GeneralSettingsSection
            canCreateTags={canCreateTags}
            canDeleteTags={canDeleteTags}
            canEditProject={canEditProject}
            project={settings.project}
            tags={settings.tags}
          />
        </FeatureMessagesProvider>
      </div>
    </SettingsShell>
  );
}
