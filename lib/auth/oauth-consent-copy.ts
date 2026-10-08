import type { OAuthConsentClient } from "./oauth-consent-types";

export type OAuthConsentCopy = {
  /** Display name when the client identified itself, otherwise null. */
  clientName: string | null;
  retryCommand: string | null;
};

export function getOAuthConsentCopy(client: OAuthConsentClient): OAuthConsentCopy {
  const name = client.name.trim();
  // "Unknown client" is the query layer's sentinel for an unidentified client.
  const named = Boolean(name && name !== "Unknown client");
  return {
    clientName: named ? name : null,
    // A dynamic display name selects retry guidance, never a trust endorsement.
    retryCommand:
      client.id === "bisibility-cli"
        ? "bisibility auth login"
        : client.dynamic && name.toLowerCase() === "codex"
          ? "codex mcp login bisibility"
          : null,
  };
}

export function canCreateOAuthApiTokens(scopes: readonly string[]) {
  return scopes.includes("tokens:write") || scopes.includes("admin");
}

export const READ_ONLY_OAUTH_CALLBACK_HOSTS = ["chatgpt.com", "chat.openai.com"] as const;

const READ_ONLY_OAUTH_SCOPES = new Set(["openid", "profile", "email", "offline_access", "read"]);

export function readOnlyOAuthScopes(requested: readonly string[]) {
  return [...new Set(requested)].filter((scope) => READ_ONLY_OAUTH_SCOPES.has(scope));
}

export function oauthConsentScopes(
  client: OAuthConsentClient,
  requested: readonly string[],
): string[] {
  let chatGptRedirect = false;
  if (client.redirectUri) {
    try {
      const host = new URL(`https://${client.redirectUri}`).hostname;
      chatGptRedirect = READ_ONLY_OAUTH_CALLBACK_HOSTS.some((allowed) => host === allowed);
    } catch {
      // Unrecognized callbacks do not identify a client.
    }
  }
  // Client metadata can only reduce access here; it never establishes trust.
  const readOnly = chatGptRedirect || client.name.trim().toLowerCase() === "chatgpt";
  return [...new Set(requested)].filter((scope) => !readOnly || READ_ONLY_OAUTH_SCOPES.has(scope));
}
