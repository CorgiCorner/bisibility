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
