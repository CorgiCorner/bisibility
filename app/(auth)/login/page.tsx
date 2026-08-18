import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLockup } from "@/components/ui";
import { returnToOrDefault } from "@/lib/auth/return-to";
import {
  DEV_DEMO_EMAIL,
  DEV_FIXED_OTP_CODE,
  ENABLED_SOCIAL_PROVIDERS,
} from "@/lib/auth/runtime-config";
import { getSession } from "@/lib/auth/session";
import { getSignInCapacity } from "@/lib/auth/signin-capacity";
import {
  GOOGLE_CAPACITY_EXHAUSTED,
  type SignInCapacityMiss,
} from "@/lib/auth/signin-capacity-types";
import { dataResidencyMessage, isCloud } from "@/lib/deployment/deployment";
import { legalConsentLinks } from "@/lib/deployment/legal";
import { getGitHubStars } from "@/lib/site/github-stars";
import { LICENSE } from "@/lib/site/site";
import {
  GithubLogoIcon as GithubLogo,
  LockKeyIcon as LockKey,
  ShieldCheckIcon as ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

// Runtime auth settings and cloud capacity must not be frozen at build time.
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    next?: string | string[];
    switch?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: Readonly<LoginPageProps> = {}) {
  const params = await searchParams;
  const error = firstParam(params?.error);
  const next = firstParam(params?.next);
  // An explicit switch keeps the form reachable while signed in; the app-scoped
  // recovery page links here when the session is the wrong account.
  const switchingAccount = firstParam(params?.switch) === "1";

  // The sign-in endpoint is the only surface that knows about the session, so marketing
  // navigation can stay static: "Sign in" is always safe to click.
  if (!switchingAccount && (await getSession())) {
    return redirect(returnToOrDefault(next));
  }

  const capacityMiss: SignInCapacityMiss =
    error?.toLowerCase() === GOOGLE_CAPACITY_EXHAUSTED ? "google" : null;
  const [capacity, githubStars] = await Promise.all([
    isCloud ? getSignInCapacity() : Promise.resolve(null),
    getGitHubStars(),
  ]);
  const brandStats: { icon: typeof GithubLogo; label: string; tone?: string }[] = [
    ...(githubStars ? [{ icon: GithubLogo, label: `${githubStars} stars` }] : []),
    { icon: ShieldCheck, label: LICENSE, tone: "text-green-text" },
    { icon: LockKey, label: "Self-hosted" },
  ];

  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <Link className="inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>

        <div className="max-w-[420px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.6px] text-accent-text">
            Open-source SEO platform
          </div>
          <h2 className="mt-3.5 mb-0 text-[32px] font-semibold leading-[1.2] tracking-[-1.1px]">
            Know exactly where you rank, and why.
          </h2>
          <p className="mt-3.5 mb-0 text-[15px] leading-[1.6] text-fg-muted">
            Daily Google positions for every keyword that matters, in a dashboard your whole team
            can read.
          </p>

          <div className="mt-[26px] overflow-hidden rounded-[13px] border border-border">
            <div className="flex items-center gap-[7px] border-code-faint border-b bg-code-bg px-3.5 py-[9px]">
              <span className="h-2.5 w-2.5 rounded-full bg-red" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow" />
              <span className="h-2.5 w-2.5 rounded-full bg-green" />
              <span className="ml-1.5 font-mono text-[11px] text-code-faint">~/bisibility</span>
            </div>
            <pre className="m-0 overflow-x-auto bg-code-bg px-4 py-[15px] font-mono text-[12.5px] leading-[1.7] text-code-fg">
              <span className="text-code-faint"># self-host in one command</span>
              {"\n"}
              <span className="text-accent-text">$</span> docker compose -f compose.yaml -f
              compose.worker.yaml -f compose.temporal.yaml up -d
              {"\n"}
              <span className="block">
                <span className="text-blue-text">✓</span> app{" "}
                <span className="text-green-text">started</span>
              </span>
              <span className="block">
                <span className="text-blue-text">✓</span> scheduled worker{" "}
                <span className="text-green-text">started</span>
              </span>
              <span className="block text-code-faint">{"  + 6 supporting services"}</span>
            </pre>
          </div>
        </div>

        <div className="flex items-center gap-4.5 font-mono text-[11.5px] text-fg-muted">
          {brandStats.map(({ icon: Icon, label, tone }) => (
            <span className="inline-flex items-center gap-1.5" key={label}>
              <Icon aria-hidden className={tone} size={14} weight="fill" />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="relative flex items-center justify-center px-6 py-11">
        <LoginForm
          capacity={capacity}
          capacityMiss={capacityMiss}
          demoEmail={DEV_DEMO_EMAIL}
          devOtpCode={DEV_FIXED_OTP_CODE}
          dataResidencyMessage={dataResidencyMessage()}
          enabledProviders={ENABLED_SOCIAL_PROVIDERS}
          legalConsentLinks={legalConsentLinks()}
          returnTo={returnToOrDefault(next)}
        />
      </section>
    </main>
  );
}
