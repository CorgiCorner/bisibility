import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type ConsentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function scopesFromParam(value: string | string[] | undefined) {
  return (firstParam(value) ?? "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export default async function OAuthConsentPage({ searchParams }: Readonly<ConsentPageProps>) {
  const params = (await searchParams) ?? {};
  const clientId = firstParam(params.client_id) ?? "";
  const scopes = scopesFromParam(params.scope);

  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden flex-col justify-between border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <Link className="flex items-center gap-[9px] text-fg no-underline" href="/">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-white">
            <ChartLineUp aria-hidden size={17} weight="bold" />
          </span>
          <span className="text-[18px] font-bold tracking-[-0.5px]">bisibility</span>
        </Link>

        <div className="max-w-[420px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.6px] text-accent">
            OAuth consent
          </div>
          <h1 className="mt-[14px] mb-0 text-[32px] font-semibold leading-[1.2] tracking-[-1.1px]">
            Review agent access.
          </h1>
          <p className="mt-[14px] mb-0 text-[15px] leading-[1.6] text-fg-muted">
            Approve only clients you recognize and scopes that match the work they need to do.
          </p>
        </div>

        <p className="m-0 max-w-[420px] text-[13px] leading-[1.6] text-fg-faint">
          The CLI stores a personal access token after approval. You can revoke it from Account
          -&gt; Security.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-11">
        <OAuthConsentForm clientId={clientId} scopes={scopes} />
      </section>
    </main>
  );
}
