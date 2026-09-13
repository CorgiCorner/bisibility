import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";

export async function IntegrationUsagePanel({
  projectRef,
  editBudget,
}: Readonly<{
  projectRef: string;
  editBudget: boolean;
}>) {
  const { resolved: dateFormat } = await getResolvedDateFormat();
  const [settings, access] = await Promise.all([
    getSettings(projectRef, { dateFormat }),
    requireReadableProject(projectRef),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  return (
    <div className="max-w-[760px]">
      <ProviderUsageCard
        canEditBudget={
          access.project.writeMode === "active" && canProjectAction(role, "manage", "project")
        }
        initialBudgetEditOpen={editBudget}
        projectId={settings.project.projectId}
        projectRef={projectRef}
        updateProviderAllocation={updateProviderConnectionAllocationAction}
        usage={settings.usage}
      />
    </div>
  );
}
