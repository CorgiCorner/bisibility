import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TrackingSettingsSection } from "@/components/settings/tracking/TrackingSettingsSection";
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
  const [settings, access] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
  ]);
  const projectRole = getProjectRole(access.actor, access.project.id);
  const canEdit =
    settings.project.writeMode === "active" &&
    canProjectAction(projectRole, "update", "project_defaults");

  return (
    <SettingsShell activeSection="tracking" projectRef={asProjectRef(access.project.publicId)}>
      <div data-settings-section-slot="tracking">
        <TrackingSettingsSection
          canEdit={canEdit}
          defaults={settings.defaults}
          domain={settings.project.domain || null}
          projectId={settings.project.projectId}
        />
      </div>
    </SettingsShell>
  );
}
