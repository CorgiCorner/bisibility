import { CompetitorSetTable } from "@/components/competitors/set/CompetitorSetTable";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { addManualCompetitor, replaceCompetitorMarkets } from "@/lib/actions/competitor-set";
import { updateCompetitorDetails } from "@/lib/actions/competitor-set-edit";
import { removeManagedCompetitor } from "@/lib/actions/competitors";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getCompetitorSetSettings } from "@/lib/queries/competitor-set-settings";
import { asProjectRef } from "@/lib/routing/app-path";

type CompetitorsSettingsPageProps = { params: Promise<{ project: string }> };

export default async function CompetitorsSettingsPage({
  params,
}: Readonly<CompetitorsSettingsPageProps>) {
  const { project: projectRef } = await params;
  const { actor, project } = await requireReadableProject(projectRef);
  const model = await getCompetitorSetSettings(project.id);
  const role = getProjectRole(actor, project.id);
  const canEdit = project.writeMode === "active" && canProjectAction(role, "update", "competitor");

  const canDelete =
    project.writeMode === "active" && canProjectAction(role, "delete", "competitor");

  return (
    <SettingsShell activeSection="competitors" projectRef={asProjectRef(project.publicId)}>
      <div data-settings-section-slot="competitors">
        <CompetitorSetTable
          {...model}
          addCompetitor={addManualCompetitor}
          canDelete={canDelete}
          canEdit={canEdit}
          projectId={project.publicId}
          replaceMarkets={replaceCompetitorMarkets}
          removeCompetitor={removeManagedCompetitor}
          updateCompetitor={updateCompetitorDetails}
        />
      </div>
    </SettingsShell>
  );
}
