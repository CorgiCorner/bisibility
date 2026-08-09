import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm";
import { BrandLockup, InfoTooltip } from "@/components/ui";
import { getOAuthConsentCopy } from "@/lib/auth/oauth-consent-copy";
import { OAUTH_AUTHORIZATION_TTL_SECONDS } from "@/lib/auth/oauth-policy";
import { requireSession } from "@/lib/auth/session";
import { getOAuthConsentClient } from "@/lib/queries/oauth-consent";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import { FingerprintIcon as Fingerprint } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createNoindexMetadata();

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

function initials(name: string | null | undefined, email: string) {
  const nameParts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (nameParts.length) {
    return `${nameParts[0]?.[0] ?? ""}${nameParts.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function requestExpiry(value: string | string[] | undefined) {
  const fallback = Date.now() + OAUTH_AUTHORIZATION_TTL_SECONDS * 1000;
  const seconds = Number(firstParam(value));
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return fallback;
  return Math.min(seconds * 1000, fallback);
}

export default async function OAuthConsentPage({ searchParams }: Readonly<ConsentPageProps>) {
  const params = (await searchParams) ?? {};
  const clientId = firstParam(params.client_id) ?? "";
  const scopes = scopesFromParam(params.scope);
  const session = await requireSession();
  const client = await getOAuthConsentClient(clientId, firstParam(params.redirect_uri));
  const copy = getOAuthConsentCopy(client);

  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[0.82fr_1.18fr]">
      <section className="hidden flex-col justify-between border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <Link className="inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>

        <div className="max-w-[420px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.6px] text-accent-text">
            OAuth consent
          </div>
          <h1 className="mt-[14px] mb-0 text-[32px] font-semibold leading-[1.2] tracking-[-1.1px]">
            {copy.heading}
          </h1>
          <p className="mt-[14px] mb-0 text-[15px] leading-[1.6] text-fg-muted">
            {copy.description}
          </p>
        </div>

        <div className="font-mono text-[11px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-1">
            <Fingerprint aria-hidden className="text-green-text" size={14} weight="fill" />
            PKCE S256
            <InfoTooltip text="PKCE binds this authorization request to the client that started it without using a stored client secret." />
          </span>
        </div>
      </section>

      <section className="flex items-center justify-center bg-bg-sunken px-4 py-8 sm:px-6 md:py-11">
        <OAuthConsentForm
          account={{
            email: session.user.email,
            initials: initials(session.user.name, session.user.email),
          }}
          client={client}
          expiresAt={requestExpiry(params.exp)}
          scopes={scopes}
        />
      </section>
    </main>
  );
}
