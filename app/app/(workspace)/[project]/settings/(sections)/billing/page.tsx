import { submitHostedPricingFeedback } from "@/app/app/(workspace)/[project]/settings/(sections)/usage/actions";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { PlanCard } from "@/components/settings/usage/PlanCard";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireSession } from "@/lib/auth/session";
import { deploymentMode } from "@/lib/deployment/deployment";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getPricingFeedbackRow } from "@/lib/queries/waitlist";
import { asProjectRef } from "@/lib/routing/app-path";

type BillingSettingsPageProps = {
  params: Promise<{ project: string }>;
};

export default async function BillingSettingsPage({ params }: Readonly<BillingSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [access, session] = await Promise.all([
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
    <SettingsShell activeSection="billing" projectRef={publicId}>
      <div
        className="max-w-[760px] scroll-mt-6"
        data-settings-section-slot="billing"
        id="plan"
        tabIndex={-1}
      >
        <PlanCard
          canSubmitPricingFeedback={writable && canProjectAction(role, "manage", "billing")}
          deployment={deploymentMode()}
          initialAnswered={pricingFeedbackAnswered}
          projectId={publicId}
          submitPricingFeedback={submitHostedPricingFeedback}
        />
      </div>
    </SettingsShell>
  );
}
