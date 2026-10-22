import { z } from "zod";
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

export const OAUTH_ACCESS_LEVELS = ["read", "read_write", "full"] as const;
export type OAuthAccessLevel = (typeof OAUTH_ACCESS_LEVELS)[number];

const LEVEL_SCOPES = {
  read: ["read"],
  read_write: ["read", "write"],
  full: ["read", "write", "admin"],
} as const satisfies Record<OAuthAccessLevel, readonly string[]>;

/** Same shape the consent form submits and the consent guard parses. */
export const oauthConsentChoiceSchema = z.object({
  accessLevel: z.enum(OAUTH_ACCESS_LEVELS).nullable(),
  allowApiTokens: z.boolean(),
});

export type OAuthConsentChoice = z.infer<typeof oauthConsentChoiceSchema>;

const LOOPBACK_REDIRECT_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** `http:` on a public host. A value without a scheme is not treated as HTTPS. */
export function oauthConsentRedirectIsInsecure(target: string | null | undefined) {
  if (!target) return false;
  try {
    const url = new URL(target);
    return url.protocol === "http:" && !LOOPBACK_REDIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function offeredOAuthAccessLevels(ceiling: readonly string[]): OAuthAccessLevel[] {
  return OAUTH_ACCESS_LEVELS.filter((level) =>
    LEVEL_SCOPES[level].every((scope) => ceiling.includes(scope)),
  );
}

/** Read and write when the client asked for it; otherwise the only offered level. */
export function defaultOAuthAccessLevel(ceiling: readonly string[]): OAuthAccessLevel | null {
  const offered = offeredOAuthAccessLevels(ceiling);
  if (offered.includes("read_write")) return "read_write";
  if (offered.includes("read")) return "read";
  return offered[0] ?? null;
}

/** Personal-token creation, or admin, which can create API keys. */
export function oauthApiTokenChoiceRequested(ceiling: readonly string[]) {
  return canCreateOAuthApiTokens(ceiling);
}

/**
 * Subset of `ceiling` for one consent choice. Defaults to read+write and leaves
 * API tokens off. Full access adds `admin`. The checkbox adds `tokens:write`
 * and does not add `admin`; `admin` does not add `tokens:write`. Identity
 * scopes and `offline_access` pass through. Nothing outside `ceiling` is added.
 */
export function selectOAuthConsentScopes(
  ceiling: readonly string[],
  choice: OAuthConsentChoice,
): string[] {
  const offered = offeredOAuthAccessLevels(ceiling);
  const level =
    choice.accessLevel && offered.includes(choice.accessLevel)
      ? choice.accessLevel
      : defaultOAuthAccessLevel(ceiling);
  const project = new Set<string>(level ? LEVEL_SCOPES[level] : []);
  return ceiling.filter((scope) => {
    if (scope === "tokens:write") return choice.allowApiTokens;
    if (scope === "read" || scope === "write" || scope === "admin") return project.has(scope);
    return true;
  });
}

function scopesWithinCeiling(ceiling: readonly string[], scope: unknown) {
  if (typeof scope !== "string") return [...ceiling];
  const submitted = new Set(scope.split(/\s+/).filter(Boolean));
  return ceiling.filter((entry) => submitted.has(entry));
}

/**
 * Accept only a subset of the policy ceiling. Dynamically registered clients
 * use the access-level choice: missing fields default to read+write with API
 * tokens off. Static reviewed clients keep every signed scope the POST still
 * lists. A posted scope list can remove scopes. It cannot add any.
 */
export function grantedOAuthConsentScopes(
  ceiling: readonly string[],
  body: { access_level?: unknown; allow_api_tokens?: unknown; scope?: unknown },
  dynamic: boolean,
) {
  if (!dynamic) return scopesWithinCeiling(ceiling, body.scope);
  const parsed = oauthConsentChoiceSchema.safeParse({
    accessLevel: body.access_level ?? null,
    allowApiTokens: body.allow_api_tokens ?? false,
  });
  const choice = parsed.success ? parsed.data : { accessLevel: null, allowApiTokens: false };
  return scopesWithinCeiling(selectOAuthConsentScopes(ceiling, choice), body.scope);
}
