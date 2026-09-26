import { submitHostedPricingFeedback } from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/usage/actions";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { renderAccountSettingsExtension } from "@/components/settings/billing/account-extension";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { PlanCard } from "@/components/settings/usage/PlanCard";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireSession } from "@/lib/auth/session";
import { deploymentMode } from "@/lib/deployment/deployment";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getPricingFeedbackRow } from "@/lib/queries/waitlist";
import { asProjectRef } from "@/lib/routing/app-path";

type BillingSettingsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ ledger?: string }>;
};

export default async function BillingSettingsPage({
  params,
  searchParams,
}: Readonly<BillingSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [access, session, runtime] = await Promise.all([
    requireReadableProject(projectRef),
    requireSession(),
    resolveRegionalDocumentLocale(),
  ]);
  const query = await searchParams;
  const billingAccount = await renderAccountSettingsExtension({
    projectRef,
    locale: runtime.locale,
    cursor: typeof query?.ledger === "string" ? query.ledger : null,
  });
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
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsUsage",
  ]);

  return (
    <SettingsShell activeSection="billing" projectRef={publicId}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div
          className={
            billingAccount ? "min-w-0 max-w-[1100px] scroll-mt-6" : "max-w-[760px] scroll-mt-6"
          }
          data-settings-section-slot="billing"
          id="plan"
          tabIndex={-1}
        >
          {billingAccount ?? (
            <PlanCard
              canSubmitPricingFeedback={writable && canProjectAction(role, "manage", "billing")}
              deployment={deploymentMode()}
              initialAnswered={pricingFeedbackAnswered}
              projectId={publicId}
              submitPricingFeedback={submitHostedPricingFeedback}
            />
          )}
        </div>
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
