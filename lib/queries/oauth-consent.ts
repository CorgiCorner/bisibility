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

function verifiedRedirectLabel(requestedValue: string | undefined, registered: string[]) {
  const requested = requestedValue ? parsedUrl(requestedValue) : null;
  const fallback = registered[0] ? parsedUrl(registered[0]) : null;
  const selected =
    requested && registered.some((candidate) => matchesRegisteredRedirect(requested, candidate))
      ? requested
      : requested
        ? null
        : fallback;

  if (!selected) return null;
  return `${selected.host}${selected.pathname}`;
}

export async function getOAuthConsentClient(
  clientId: string,
  requestedRedirectUri: string | undefined,
): Promise<OAuthConsentClient> {
  const dynamic = isDynamicallyRegisteredOAuthClient(clientId);
  if (!clientId) {
    return { dynamic, id: "", name: "Unknown client", redirectUri: null };
  }

  const client = await prisma.oauthClient.findUnique({
    select: { clientId: true, name: true, redirectUris: true },
    where: { clientId },
  });

  if (!client) {
    return { dynamic, id: clientId, name: "Unknown client", redirectUri: null };
  }

  return {
    dynamic,
    id: client.clientId,
    name: client.name?.trim() || "Unknown client",
    redirectUri: verifiedRedirectLabel(requestedRedirectUri, client.redirectUris),
  };
}
