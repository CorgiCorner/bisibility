import { ReplaySurface } from "@/components/analytics/ReplaySurface";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { OnboardingLogoutButton } from "@/components/onboarding/OnboardingLogoutButton";
import { renderAccountDataSourceExtension } from "@/components/settings/AccountDataSourceExtension";
import { shellUserEmail } from "@/components/shell/types";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { ThemeSegments } from "@/components/ui/ThemeSegments";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { appExtensions } from "@/lib/app-extensions";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { requireSession } from "@/lib/auth/session";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { readDemoConfig } from "@/lib/demo/config";
import { isCloud } from "@/lib/deployment/deployment";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import type { ReactNode } from "react";

async function onboardingRuntime() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "auth",
    "onboarding",
    "projectCostEstimate",
  ]);
  return { ...runtime, messages, t: createIntlTranslator(runtime.locale, messages, runtime) };
}

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["onboarding"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return createNoindexMetadata({
    title: t("onboarding.metadata.title"),
    description: t("onboarding.metadata.description"),
  });
}

type OnboardingLayoutProps = {
  children: ReactNode;
};

export default async function OnboardingLayout({ children }: Readonly<OnboardingLayoutProps>) {
  await redirectToSetupIfFirstRun();
  const [session, runtime] = await Promise.all([requireSession(), onboardingRuntime()]);

  const email = shellUserEmail(session.user);
  const initials = avatarInitials(session.user.name ?? "", email);
  const avatarSrc = gravatarUrl(email, 22);
  const isDemo = readDemoConfig().kind !== "disabled";
  const supportWidget =
    isCloud && !isDemo
      ? await appExtensions.renderSupportWidget({
          expiresAt: session.session.expiresAt,
          userId: session.user.id,
        })
      : null;

  const decorated = isDemo ? children : await renderAccountDataSourceExtension(children);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={runtime.messages}
      timeZone={runtime.timeZone}
    >
      <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-[46px] text-fg sm:px-6">
        {supportWidget}
        <div className="flex w-full max-w-[940px] flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLockup />
            <div className="inline-flex items-center gap-3 text-[12.5px] text-fg-muted">
              <span data-analytics-block className="inline-flex items-center gap-1.5">
                <Avatar
                  alt=""
                  className="h-[22px] w-[22px] rounded-control bg-accent-solid text-[9px] font-semibold text-accent-on-solid"
                  initials={initials}
                  src={avatarSrc}
                />
                {email}
              </span>
              <span aria-hidden className="h-4 w-px bg-border" />
              <span className="text-fg-muted">{runtime.t("onboarding.layout.notYou")}</span>
              <OnboardingLogoutButton />
            </div>
          </header>
          {isDemo ? children : <ReplaySurface kind="onboarding">{decorated}</ReplaySurface>}
          <div className="mt-auto pt-14">
            <footer className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-6 text-xs text-fg-muted">
              <span>{runtime.t("onboarding.layout.copyright")}</span>
              <ThemeSegments size="sm" />
            </footer>
          </div>
        </div>
      </main>
    </FeatureMessagesProvider>
  );
}
