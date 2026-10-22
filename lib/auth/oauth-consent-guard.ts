import "server-only";

import { getOAuthClientScopePolicy, getOAuthConsentClient } from "@/lib/queries/oauth-consent";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import {
  grantedOAuthConsentScopes,
  oauthConsentScopes,
  readOnlyOAuthScopes,
} from "./oauth-consent-copy";
import {
  IOS_OAUTH_CLIENT_SCOPES,
  isDynamicallyRegisteredOAuthClient,
  isFirstPartyApiOAuthClient,
  isFirstPartyApiOAuthScope,
} from "./oauth-policy";

/** First-party app clients hold only their fixed scopes; nobody else holds `api:*`. */
function firstPartyApiScopeCeiling(clientId: string | null, requested: string[]) {
  if (!isFirstPartyApiOAuthClient(clientId)) {
    return requested.filter((scope) => !isFirstPartyApiOAuthScope(scope));
  }
  return requested.filter((scope) =>
    (IOS_OAUTH_CLIENT_SCOPES as readonly string[]).includes(scope),
  );
}

/** Apply the same ceiling to existing grants and refresh-derived access tokens. */
export async function allowedOAuthTokenScopes(clientId: string | null, unchecked: string[]) {
  const requested = firstPartyApiScopeCeiling(clientId, unchecked);
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
            // Ceiling is the signed authorization request, never the posted scope list.
            const signed = (query.get("scope") ?? "").split(/\s+/).filter(Boolean);
            const accepted = oauthConsentScopes(client, signed);
            const ceiling = await allowedOAuthTokenScopes(clientId, accepted);
            // Dynamically registered clients use the access-level choice. Static reviewed
            // clients keep the signed scopes. Either way the result stays inside the ceiling.
            const dynamic = isDynamicallyRegisteredOAuthClient(clientId);
            const granted = grantedOAuthConsentScopes(ceiling, context.body, dynamic);
            context.body.scope = granted.join(" ");
          }),
        },
      ],
    },
  };
}
