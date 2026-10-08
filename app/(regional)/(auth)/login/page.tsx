import { EditableDemoLogin } from "@/components/auth/EditableDemoLogin";
import { ExploreDemo } from "@/components/auth/ExploreDemo";
import { LoginForm } from "@/components/auth/LoginForm";
import { RememberedWebsiteCue } from "@/components/auth/RememberedWebsiteCue";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { isEmailSignInUnavailable } from "@/lib/auth/email-sign-in-availability";
import { isFirstRun } from "@/lib/auth/first-run";
import { onboardingWebsiteFromReturnTo, returnToOrDefault } from "@/lib/auth/return-to";
import {
  DEV_DEMO_EMAIL,
  DEV_FIXED_OTP_CODE,
  ENABLED_SOCIAL_PROVIDERS,
  FIXED_OTP_ENABLED,
} from "@/lib/auth/runtime-config";
import { getSession } from "@/lib/auth/session";
import { getSignInCapacity } from "@/lib/auth/signin-capacity";
import {
  GOOGLE_CAPACITY_EXHAUSTED,
  type SignInCapacityMiss,
} from "@/lib/auth/signin-capacity-types";
import { readDemoConfig } from "@/lib/demo/config";
import { demoNextPath } from "@/lib/demo/demo-next-path";
import { explicitDeploymentDataRegionLabel, isCloud } from "@/lib/deployment/deployment";
import { legalConsentLinks } from "@/lib/deployment/legal";
import { refreshInstanceMailRuntime } from "@/lib/email/instance-mail-store";
import { isEmailConfigured } from "@/lib/email/registry";
import { getGitHubStars } from "@/lib/site/github-stars";
import { LICENSE } from "@/lib/site/site";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/dist/ssr/GithubLogo";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import Link from "next/link";
import { redirect } from "next/navigation";

// Runtime auth settings and cloud capacity must not be frozen at build time.
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<
    Record<string, string | string[] | undefined> & {
      error?: string | string[];
      next?: string | string[];
      owner?: string | string[];
      switch?: string | string[];
    }
  >;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function demoLoginSwitchHref(
  params: Record<string, string | string[] | undefined>,
  owner: boolean,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, entry);
  }
  if (owner) query.set("owner", "1");
  else query.delete("owner");
  query.set("switch", "1");
  return `/login?${query}`;
}

export default async function LoginPage({ searchParams }: Readonly<LoginPageProps> = {}) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["auth"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const params = await searchParams;
  const error = firstParam(params?.error);
  const next = firstParam(params?.next);
  const ownerSignIn = firstParam(params?.owner) === "1";
  // An explicit switch keeps the form reachable while signed in; the app-scoped
  // recovery page links here when the session is the wrong account.
  const switchingAccount = firstParam(params?.switch) === "1";
  const returnTo = returnToOrDefault(next);
  const rememberedWebsite = onboardingWebsiteFromReturnTo(next);

  // The sign-in endpoint is the only surface that knows about the session, so marketing
  // navigation can stay static: "Sign in" is always safe to click.
  const demo = readDemoConfig();
  const demoOAuthRequest =
    demo.kind === "editable" && firstParam(params?.client_id) && firstParam(params?.sig);
  if (!switchingAccount && !demoOAuthRequest && (await getSession())) {
    return redirect(returnTo);
  }

  const editableOwnerSignIn = demo.kind === "editable" && ownerSignIn;
  if (demo.kind === "legacy-read-only") {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
        <div className="w-full max-w-sm">
          <ExploreDemo nextPath={demoNextPath(next)} />
        </div>
      </main>
    );
  }
  if (demo.kind === "editable" && !editableOwnerSignIn) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
        <div className="w-full max-w-sm">
          <EditableDemoLogin
            nextPath={demoNextPath(next, demo.projectPublicId)}
            ownerSignInHref={demoLoginSwitchHref(params ?? {}, true)}
          />
        </div>
      </main>
    );
  }

  const capacityMiss: SignInCapacityMiss =
    error?.toLowerCase() === GOOGLE_CAPACITY_EXHAUSTED ? "google" : null;
  const [capacity, githubStars, firstRun] = await Promise.all([
    isCloud ? getSignInCapacity() : Promise.resolve(null),
    getGitHubStars(),
    isFirstRun(),
  ]);
  await refreshInstanceMailRuntime();
  const emailSignInUnavailable = isEmailSignInUnavailable({
    firstRun,
    fixedOtpEnabled: FIXED_OTP_ENABLED,
    isEmailConfigured: isEmailConfigured(),
    production: process.env.NODE_ENV === "production",
  });
  const dataRegion = explicitDeploymentDataRegionLabel();
  const brandStats: { icon: typeof GithubLogo; label: string; tone?: string }[] = [
    ...(githubStars
      ? [{ icon: GithubLogo, label: t("auth.login.brand.stars", { count: Number(githubStars) }) }]
      : []),
    { icon: ShieldCheck, label: LICENSE, tone: "text-green-text" },
    { icon: LockKey, label: t("auth.login.brand.ownKeys") },
  ];

  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <Link className="inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>

        <div className="max-w-[420px]">
          <div className="text-[11px] uppercase tracking-[0.6px] text-accent-text">
            {t("auth.login.brand.kicker")}
          </div>
          <h2 className="mt-3.5 mb-0 text-[32px] font-semibold leading-[1.2] tracking-[-1.1px]">
            {t("auth.login.brand.title")}
          </h2>
          <p className="mt-3.5 mb-0 text-[15px] leading-[1.6] text-fg-muted">
            {t("auth.login.brand.description")}
          </p>
        </div>

        <div className="flex items-center gap-4.5 text-[11.5px] text-fg-muted">
          {brandStats.map(({ icon: Icon, label, tone }) => (
            <span className="inline-flex items-center gap-1.5" key={label}>
              <Icon aria-hidden className={tone} size={14} weight="regular" />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="relative flex items-center justify-center px-6 py-11">
        <div className="w-full max-w-[380px]">
          {rememberedWebsite ? <RememberedWebsiteCue website={rememberedWebsite} /> : null}
          <LoginForm
            capacity={capacity}
            capacityMiss={capacityMiss}
            demoEmail={editableOwnerSignIn ? null : DEV_DEMO_EMAIL}
            devOtpCode={editableOwnerSignIn ? null : DEV_FIXED_OTP_CODE}
            dataResidencyMessage={
              dataRegion ? t("auth.login.dataResidency", { region: dataRegion }) : ""
            }
            emailSignInUnavailable={emailSignInUnavailable}
            enabledProviders={editableOwnerSignIn ? undefined : ENABLED_SOCIAL_PROVIDERS}
            humanVerificationRequired={isCloud}
            legalConsentLinks={legalConsentLinks()}
            returnTo={returnTo}
          />
          {editableOwnerSignIn ? (
            <p className="mt-5 mb-0 text-center text-sm text-fg-muted">
              <Link
                className="font-medium text-fg underline underline-offset-4"
                href={demoLoginSwitchHref(params ?? {}, false)}
              >
                {t("auth.login.editDemo")}
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
