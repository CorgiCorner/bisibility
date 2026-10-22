import "server-only";

import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import { isDynamicallyRegisteredOAuthClient } from "@/lib/auth/oauth-policy";
import { prisma } from "@/lib/db/prisma";

function parsedUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

function matchesRegisteredRedirect(requested: URL, registeredValue: string) {
  const registered = parsedUrl(registeredValue);
  if (!registered) return false;
  if (registered.href === requested.href) return true;

  return (
    isLoopbackHostname(registered.hostname) &&
    registered.hostname === requested.hostname &&
    registered.protocol === requested.protocol &&
    registered.pathname === requested.pathname &&
    registered.search === requested.search
  );
}

function redirectPresentation(requestedValue: string | undefined, registered: string[]) {
  const requested = requestedValue ? parsedUrl(requestedValue) : null;
  const matched = requested
    ? registered.find((candidate) => matchesRegisteredRedirect(requested, candidate))
    : undefined;
  if (requested && !matched) return null;

  const raw = matched ?? registered[0];
  if (!raw) return null;
  const parsed = parsedUrl(raw);
  // A stored value with no scheme cannot be reconstructed. Show it unchanged.
  if (!parsed) return { label: null, target: raw };

  const selected = requested && matched ? requested : parsed;
  // Keep the registered string when it already is that URI. Loopback requests
  // may use another port; that exact requested URI still includes its scheme.
  const target = selected.href === parsed.href ? raw : selected.href;
  return { label: `${selected.host}${selected.pathname}`, target };
}

export async function getOAuthConsentClient(
  clientId: string,
  requestedRedirectUri: string | undefined,
): Promise<OAuthConsentClient> {
  const dynamic = isDynamicallyRegisteredOAuthClient(clientId);
  if (!clientId) {
    return { dynamic, id: "", name: "Unknown client", redirectTarget: null, redirectUri: null };
  }

  const client = await prisma.oauthClient.findUnique({
    select: { clientId: true, name: true, redirectUris: true },
    where: { clientId },
  });

  if (!client) {
    return {
      dynamic,
      id: clientId,
      name: "Unknown client",
      redirectTarget: null,
      redirectUri: null,
    };
  }

  const redirect = redirectPresentation(requestedRedirectUri, client.redirectUris);
  return {
    dynamic,
    id: client.clientId,
    name: client.name?.trim() || "Unknown client",
    redirectTarget: redirect?.target ?? null,
    redirectUri: redirect?.label ?? null,
  };
}

/** Token verification has no redirect parameter, so every registered callback participates. */
export async function getOAuthClientScopePolicy(clientId: string) {
  return prisma.oauthClient.findUnique({
    select: { name: true, redirectUris: true },
    where: { clientId },
  });
}
