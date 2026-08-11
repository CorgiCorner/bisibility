import {
  submitHostedPricingFeedback,
  updateUsageBudget,
} from "@/app/app/(workspace)/[project]/settings/(sections)/usage/actions";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { UsageSettingsContent } from "@/components/settings/usage/UsageSettingsContent";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { deploymentMode } from "@/lib/deployment/deployment";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type UsageSettingsPageProps = { params: Promise<{ project: string }> };

export default async function UsageSettingsPage({ params }: Readonly<UsageSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const publicId = asProjectRef(access.project.publicId);
  const writable = access.project.writeMode === "active";

  return (
    <SettingsShell activeSection="usage" projectRef={publicId}>
      <div data-settings-section-slot="usage">
        <UsageSettingsContent
          canEditBudget={writable && canProjectAction(role, "manage", "project")}
          canSubmitPricingFeedback={writable && canProjectAction(role, "manage", "billing")}
          deployment={deploymentMode()}
          projectId={settings.project.projectId}
          submitPricingFeedback={submitHostedPricingFeedback}
          updateBudget={updateUsageBudget}
          usage={settings.usage}
        />
      </div>
    </SettingsShell>
  );
}
