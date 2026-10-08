import "server-only";

import { getOAuthClientScopePolicy, getOAuthConsentClient } from "@/lib/queries/oauth-consent";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { oauthConsentScopes, readOnlyOAuthScopes } from "./oauth-consent-copy";

/** Apply the same ceiling to existing grants and refresh-derived access tokens. */
export async function allowedOAuthTokenScopes(clientId: string | null, requested: string[]) {
  const policy = clientId ? await getOAuthClientScopePolicy(clientId) : null;
  if (!policy) return readOnlyOAuthScopes(requested);
  const redirects = policy.redirectUris.length ? policy.redirectUris : [null];
  return redirects.reduce((scopes, redirect) => {
    let redirectUri: string | null = null;
    if (redirect) {
      try {
        const url = new URL(redirect);
        redirectUri = `${url.host}${url.pathname}`;
      } catch {
        // Invalid registered callbacks cannot identify a client.
      }
    }
    return oauthConsentScopes(
      { dynamic: true, id: clientId ?? "", name: policy.name ?? "Unknown client", redirectUri },
      scopes,
    );
  }, requested);
}

export function oauthConsentGuard(): BetterAuthPlugin {
  return {
    id: "oauth-consent-scope-guard",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/oauth2/consent",
          handler: createAuthMiddleware(async (context) => {
            if (context.body?.accept !== true || typeof context.body.oauth_query !== "string")
              return;
            const query = new URLSearchParams(context.body.oauth_query);
            const clientId = query.get("client_id");
            if (!clientId) return;
            const client = await getOAuthConsentClient(
              clientId,
              query.get("redirect_uri") ?? undefined,
            );
            const requested =
              typeof context.body.scope === "string"
                ? context.body.scope
                : (query.get("scope") ?? "");
            // Narrow accepted scopes only; the provider still verifies the original signed query.
            const accepted = oauthConsentScopes(client, requested.split(/\s+/).filter(Boolean));
            context.body.scope = (await allowedOAuthTokenScopes(clientId, accepted)).join(" ");
          }),
        },
      ],
    },
  };
}
