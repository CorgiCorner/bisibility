import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { UsageDisplayControls } from "@/components/metering/UsageDisplayControls";
import { DataCacheSettings } from "@/components/settings/general/DataCacheSettings";
import { GeneralSettingsSection } from "@/components/settings/general/GeneralSettingsSection";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readProjectDataCache } from "@/lib/actions/project-data-cache";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";
import { unstable_rethrow } from "next/navigation";

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
    "projectSettingsUsage",
  ]);
  const dataCache = await readProjectDataCache({ projectId: access.project.publicId }).catch(
    (error: unknown) => {
      unstable_rethrow(error);
      console.error("[settings] Project cache unavailable.");
      return null;
    },
  );
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
          <div className="mt-5 max-w-[640px]">
            <UsageDisplayControls />
          </div>
          <div className="mt-5 max-w-[640px]">
            <DataCacheSettings
              projectId={access.project.publicId}
              canEdit={canEditProject}
              initial={dataCache}
            />
          </div>
        </FeatureMessagesProvider>
      </div>
    </SettingsShell>
  );
}
