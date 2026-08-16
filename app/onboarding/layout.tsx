import { OnboardingLogoutButton } from "@/components/onboarding/OnboardingLogoutButton";
import { shellUserEmail } from "@/components/shell/types";
import { BrandLockup, ThemeSegments } from "@/components/ui";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createNoindexMetadata({
  title: "Onboarding | bisibility",
  description: "Set up a bisibility project.",
});

type OnboardingLayoutProps = {
  children: ReactNode;
};

export default async function OnboardingLayout({ children }: Readonly<OnboardingLayoutProps>) {
  await redirectToSetupIfFirstRun();
  const session = await requireSession();

  const email = shellUserEmail(session.user);
  const initials = avatarInitials(session.user.name ?? "", session.user.email);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-[46px] pb-[120px] text-fg sm:px-6">
      <div className="flex w-full max-w-[940px] flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandLockup />
          <div className="inline-flex items-center gap-3 text-[12.5px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent-solid font-mono text-[9px] font-semibold text-primary-contrast">
                {initials}
              </span>
              {email}
            </span>
            <span aria-hidden className="h-4 w-px bg-border-strong" />
            <span className="text-fg-muted">Not you?</span>
            <OnboardingLogoutButton />
          </div>
        </header>
        {children}
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-border border-t pt-6 font-mono text-xs text-fg-muted">
          <span>© 2026 bisibility</span>
          <ThemeSegments size="sm" />
        </footer>
      </div>
    </main>
  );
}
