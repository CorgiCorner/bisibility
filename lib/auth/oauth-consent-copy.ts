import type { OAuthConsentClient } from "./oauth-consent-types";

export type OAuthConsentPersona = "agent" | "cli" | "generic";

export type OAuthConsentCopy = {
  description: string;
  heading: string;
  persona: OAuthConsentPersona;
  retryCommand: string | null;
};

const genericCopy: OAuthConsentCopy = {
  description:
    "Approve only a client you just started yourself, and scopes that match what it needs.",
  heading: "Review client access.",
  persona: "generic",
  retryCommand: null,
};

const clientCopyById: Record<string, OAuthConsentCopy> = {
  "bisibility-cli": {
    description:
      "Approve only if you just started bisibility auth login on this device and the requested scopes match what the CLI needs.",
    heading: "Sign in to Bisibility CLI",
    persona: "cli",
    retryCommand: "bisibility auth login",
  },
};

// Dynamic display names select copy only and must never imply that a client is trusted.
const clientCopyByName: Record<string, OAuthConsentCopy> = {
  codex: {
    description:
      "Approve only clients you just started yourself, and scopes that match the work they need to do.",
    heading: "Review agent access.",
    persona: "agent",
    retryCommand: "codex mcp login bisibility",
  },
};

export function getOAuthConsentCopy(client: OAuthConsentClient) {
  return (
    clientCopyById[client.id] ??
    (client.dynamic ? clientCopyByName[client.name.trim().toLowerCase()] : undefined) ??
    genericCopy
  );
}
