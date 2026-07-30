import { LoginForm } from "@/components/auth/LoginForm";
import { returnToOrDefault } from "@/lib/auth/return-to";
import {
  DEV_DEMO_EMAIL,
  DEV_FIXED_OTP_CODE,
  ENABLED_SOCIAL_PROVIDERS,
} from "@/lib/auth/runtime-config";
import { getSignInCapacity } from "@/lib/auth/signin-capacity";
import {
  GOOGLE_CAPACITY_EXHAUSTED,
  type SignInCapacityMiss,
} from "@/lib/auth/signin-capacity-types";
import { dataResidencyMessage, isCloud } from "@/lib/deployment/deployment";
import { legalConsentLinks } from "@/lib/deployment/legal";
import { GITHUB_STARS, LICENSE } from "@/lib/site/site";
import {
  ChartLineUpIcon as ChartLineUp,
  GithubLogoIcon as GithubLogo,
  LockKeyIcon as LockKey,
  ShieldCheckIcon as ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

// Runtime auth settings and cloud capacity must not be frozen at build time.
export const dynamic = "force-dynamic";

const brandStats: { icon: typeof GithubLogo; label: string; tone?: string }[] = [
  { icon: GithubLogo, label: `${GITHUB_STARS} stars` },
  { icon: ShieldCheck, label: LICENSE, tone: "text-green" },
  { icon: LockKey, label: "Self-hosted" },
];

type LoginPageProps = {
  searchParams?: Promise<{ error?: string | string[]; next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: Readonly<LoginPageProps> = {}) {
  const params = await searchParams;
  const error = Array.isArray(params?.error) ? params.error[0] : params?.error;
  const next = Array.isArray(params?.next) ? params.next[0] : params?.next;
  const capacityMiss: SignInCapacityMiss =
    error?.toLowerCase() === GOOGLE_CAPACITY_EXHAUSTED ? "google" : null;
  const capacity = isCloud ? await getSignInCapacity() : null;

  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <Link className="flex items-center gap-[9px] text-fg no-underline" href="/">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-white">
            <ChartLineUp aria-hidden size={17} weight="bold" />
          </span>
          <span className="text-[18px] font-bold tracking-[-0.5px]">bisibility</span>
        </Link>

        <div className="max-w-[420px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.6px] text-accent">
            Open-source rank tracking
          </div>
          <h2 className="mt-[14px] mb-0 text-[32px] font-semibold leading-[1.2] tracking-[-1.1px]">
            Know exactly where you rank, and why.
          </h2>
          <p className="mt-[14px] mb-0 text-[15px] leading-[1.6] text-fg-muted">
            Daily Google positions for every keyword that matters, in a dashboard your whole team
            can read. Bring your own SERP provider.
          </p>

          <div className="mt-[26px] overflow-hidden rounded-[13px] border border-border">
            <div className="flex items-center gap-[7px] border-code-faint border-b bg-code-bg px-[14px] py-[9px]">
              <span className="h-2.5 w-2.5 rounded-full bg-red" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow" />
              <span className="h-2.5 w-2.5 rounded-full bg-green" />
              <span className="ml-1.5 font-mono text-[11px] text-code-faint">~/bisibility</span>
            </div>
            <pre className="m-0 overflow-x-auto bg-code-bg px-4 py-[15px] font-mono text-[12.5px] leading-[1.7] text-code-fg">
              <span className="text-code-faint"># self-host in one command</span>
              {"\n"}
              <span className="text-accent">$</span> docker compose --profile scheduled up -d
              {"\n"}
              <span className="block">
                <span className="text-blue">✓</span> app <span className="text-green">started</span>
              </span>
              <span className="block">
                <span className="text-blue">✓</span> scheduled worker{" "}
                <span className="text-green">started</span>
              </span>
              <span className="block text-code-faint">{"  + 6 supporting services"}</span>
            </pre>
          </div>
        </div>

        <div className="flex items-center gap-[18px] font-mono text-[11.5px] text-fg-faint">
          {brandStats.map(({ icon: Icon, label, tone }) => (
            <span className="inline-flex items-center gap-1.5" key={label}>
              <Icon aria-hidden className={tone} size={14} weight="fill" />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-11">
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
