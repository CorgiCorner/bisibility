import {
  submitHostedPricingFeedback,
  updateUsageBudget,
} from "@/app/app/(workspace)/[project]/settings/(sections)/usage/actions";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { UsageSettingsContent } from "@/components/settings/usage/UsageSettingsContent";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireSession } from "@/lib/auth/session";
import { deploymentMode } from "@/lib/deployment/deployment";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { getPricingFeedbackRow } from "@/lib/queries/waitlist";
import { asProjectRef } from "@/lib/routing/app-path";

type UsageSettingsPageProps = { params: Promise<{ project: string }> };

export default async function UsageSettingsPage({ params }: Readonly<UsageSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access, session] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    requireSession(),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const publicId = asProjectRef(access.project.publicId);
  const writable = access.project.writeMode === "active";
  // Query the waitlist row directly here rather than through a "use server"
  // helper: exporting that lookup would expose an unauthenticated
  // email-existence oracle. Answered when the row was captured as settings
  // feedback or when the feedback timestamp is set (the OR covers legacy rows
  // whose source predates hostedPriceAnsweredAt).
  const waitlistRow = await getPricingFeedbackRow(session.user.email);
  const pricingFeedbackAnswered =
    waitlistRow?.source === "settings_feedback" || waitlistRow?.hostedPriceAnsweredAt != null;

  return (
    <SettingsShell activeSection="usage" projectRef={publicId}>
      <div data-settings-section-slot="usage">
        <UsageSettingsContent
          canEditBudget={writable && canProjectAction(role, "manage", "project")}
          canSubmitPricingFeedback={writable && canProjectAction(role, "manage", "billing")}
          deployment={deploymentMode()}
          initialPricingFeedbackAnswered={pricingFeedbackAnswered}
          projectId={settings.project.projectId}
          submitPricingFeedback={submitHostedPricingFeedback}
          updateBudget={updateUsageBudget}
          usage={settings.usage}
        />
      </div>
    </SettingsShell>
  );
}
