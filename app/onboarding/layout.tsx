import { OnboardingLogoutButton } from "@/components/onboarding/OnboardingLogoutButton";
import { shellUserEmail, shellUserInitials } from "@/components/shell/types";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createNoindexMetadata({
  title: "Onboarding | Bisibility",
  description: "Set up a Bisibility project.",
});

type OnboardingLayoutProps = {
  children: ReactNode;
};

export default async function OnboardingLayout({ children }: Readonly<OnboardingLayoutProps>) {
  await redirectToSetupIfFirstRun();
  const session = await requireSession();

  const email = shellUserEmail(session.user);
  const initials = shellUserInitials(session.user);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-[46px] pb-[120px] text-fg sm:px-6">
      <div className="w-full max-w-[940px]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-[9px]">
            <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-white">
              <ChartLineUp aria-hidden size={17} weight="bold" />
            </span>
            <span className="text-lg font-bold tracking-[-0.5px]">bisibility</span>
          </div>
          <div className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent font-mono text-[9px] font-semibold text-white">
                {initials}
              </span>
              {email}
            </span>
            <span className="text-fg-faint">&middot;</span>
            <span className="text-fg-faint">Not you?</span>
            <OnboardingLogoutButton />
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
