import { TrackedMarketsContent } from "@/components/settings/markets/TrackedMarketsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TrackingSettingsSection } from "@/components/settings/tracking/TrackingSettingsSection";
import {
  addProjectMarkets,
  removeProjectMarketFromProject,
  setProjectMarketEnabled,
} from "@/lib/actions/project-markets";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type TrackingSettingsPageProps = { params: Promise<{ project: string }> };

export default async function TrackingSettingsPage({
  params,
}: Readonly<TrackingSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access, markets] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    getProjectMarkets(projectRef),
  ]);
  const projectRole = getProjectRole(access.actor, access.project.id);
  const writable = settings.project.writeMode === "active";
  const canEdit = writable && canProjectAction(projectRole, "update", "project_defaults");

  return (
    <SettingsShell activeSection="tracking" projectRef={asProjectRef(access.project.publicId)}>
      <div className="space-y-5" data-settings-section-slot="tracking">
        <TrackingSettingsSection
          canEdit={canEdit}
          defaults={settings.defaults}
          domain={settings.project.domain || null}
          projectId={settings.project.projectId}
        />
        <TrackedMarketsContent
          addMarkets={addProjectMarkets}
          canEdit={writable && canProjectAction(projectRole, "update", "project_market")}
          canRemove={writable && canProjectAction(projectRole, "delete", "project_market")}
          markets={markets}
          removeMarket={removeProjectMarketFromProject}
          setMarketEnabled={setProjectMarketEnabled}
        />
      </div>
    </SettingsShell>
  );
}
