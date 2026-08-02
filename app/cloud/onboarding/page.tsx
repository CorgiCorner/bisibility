import { CloudOnboarding } from "@/components/cloud/CloudOnboarding";
import { CloudOnboardingSteps } from "@/components/cloud/CloudOnboardingSteps";
import { CloudTopBar } from "@/components/cloud/CloudTopBar";
import { requireSession } from "@/lib/auth/session";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = createNoindexMetadata({
  title: "Get started | bisibility Cloud",
  description:
    "Start your first bisibility Cloud workspace: create a fresh workspace or import from a self-hosted instance.",
});

/**
 * Post-signup Cloud onboarding. A focused task page (chrome via CloudTopBar in
 * "onboard" context): pick how your first workspace begins. See HANDOFF-26 section 1.
 */
export default async function CloudOnboardingPage() {
  const session = await requireSession();
  const email = session.user.email || "your account";
  const workspaces = await listWorkspaces();
  if (workspaces.length > 0) {
    redirect("/app");
  }

  return (
    <>
      <CloudTopBar ctx="onboard" onboardStep={2} />
      <main className="pt-11">
        <h1 className="text-[clamp(28px,3.6vw,38px)] font-semibold leading-[1.08] tracking-[-1.2px]">
          How do you want to start your first workspace?
        </h1>
        <p className="mt-3 max-w-[560px] text-[15.5px] leading-[1.6] text-fg-muted">
          Signed in as <strong className="font-semibold text-fg">{email}</strong>. Pick how your
          first Cloud workspace begins.
        </p>

        <CloudOnboardingSteps currentStep={2} />

        <CloudOnboarding />
      </main>
    </>
  );
}
