import { DataSourcesSettingsContent } from "@/components/settings/data-sources/DataSourcesSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type Props = { params: Promise<{ project: string }> };
export default async function DataSourcesSettingsPage({ params }: Readonly<Props>) {
  const { project: projectRef } = await params;
  const [settings, access] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const canEdit =
    settings.project.writeMode === "active" && canProjectAction(role, "update", "project_defaults");
  return (
    <SettingsShell activeSection="data-sources" projectRef={asProjectRef(access.project.publicId)}>
      <div data-settings-section-slot="data-sources">
        <DataSourcesSettingsContent
          canEdit={canEdit}
          defaults={settings.defaults}
          projectId={settings.project.projectId}
        />
      </div>
    </SettingsShell>
  );
}
