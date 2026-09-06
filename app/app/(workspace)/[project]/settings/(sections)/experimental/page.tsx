import { ExperimentalModulesSection } from "@/components/settings/experimental/ExperimentalModulesSection";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { asProjectRef } from "@/lib/routing/app-path";

type ExperimentalSettingsPageProps = { params: Promise<{ project: string }> };

export default async function ExperimentalSettingsPage({
  params,
}: Readonly<ExperimentalSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [{ actor, project }, enabledExperimentalModules] = await Promise.all([
    requireReadableProject(projectRef),
    getExperimentalModules(projectRef),
  ]);
  const role = getProjectRole(actor, project.id);
  const canEdit =
    project.writeMode === "active" && canProjectAction(role, "update", "project_defaults");

  return (
    <SettingsShell activeSection="experimental" projectRef={asProjectRef(project.publicId)}>
      <div data-settings-section-slot="experimental">
        <ExperimentalModulesSection
          canEdit={canEdit}
          enabledExperimentalModules={enabledExperimentalModules}
          projectId={project.publicId}
        />
      </div>
    </SettingsShell>
  );
}
