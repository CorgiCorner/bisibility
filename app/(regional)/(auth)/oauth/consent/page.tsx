import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { OAUTH_AUTHORIZATION_TTL_SECONDS } from "@/lib/auth/oauth-policy";
import { requireSession } from "@/lib/auth/session";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { getOAuthConsentClient } from "@/lib/queries/oauth-consent";
import { createNoindexMetadata } from "@/lib/seo/noindex";
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
  const [runtime, session, client] = await Promise.all([
    resolveRegionalDocumentLocale(),
    requireSession(),
    getOAuthConsentClient(clientId, firstParam(params.redirect_uri)),
  ]);
  const messages = await loadCoreMessages(runtime.locale, ["auth"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-sunken px-4 py-8 text-fg sm:px-6">
      <Link
        aria-label={t("auth.oauthConsent.brandHome")}
        className="mb-7 inline-flex no-underline"
        href="/"
      >
        <BrandLockup />
      </Link>
      <OAuthConsentForm
        account={{
          avatarUrl: gravatarUrl(session.user.email, 26),
          email: session.user.email,
          initials: avatarInitials(session.user.name ?? "", session.user.email),
        }}
        client={client}
        expiresAt={requestExpiry(params.exp)}
        scopes={scopes}
      />
    </main>
  );
}
