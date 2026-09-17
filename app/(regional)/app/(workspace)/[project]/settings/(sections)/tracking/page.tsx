import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TrackingSettingsSection } from "@/components/settings/tracking/TrackingSettingsSection";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type TrackingSettingsPageProps = { params: Promise<{ project: string }> };

export default async function TrackingSettingsPage({
  params,
}: Readonly<TrackingSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access, runtime] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsTracking",
  ]);
  const projectRole = getProjectRole(access.actor, access.project.id);
  const writable = settings.project.writeMode === "active";
  const canEdit = writable && canProjectAction(projectRole, "update", "project_defaults");

  return (
    <SettingsShell activeSection="tracking" projectRef={asProjectRef(access.project.publicId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div className="space-y-5" data-settings-section-slot="tracking">
          <TrackingSettingsSection
            canEdit={canEdit}
            defaults={settings.defaults}
            domain={settings.project.domain || null}
            projectId={settings.project.projectId}
          />
        </div>
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
