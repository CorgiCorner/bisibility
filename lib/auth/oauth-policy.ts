export const FIRST_PARTY_OAUTH_CLIENT_ID = "bisibility-cli";
/** Native iOS app; the only client whose opaque access tokens `/api/v1` accepts (ADR-021). */
export const IOS_OAUTH_CLIENT_ID = "bisibility-ios";
export const FIRST_PARTY_API_OAUTH_CLIENT_IDS: readonly string[] = [IOS_OAUTH_CLIENT_ID];
/** Scopes only first-party API clients may hold; never offered to registered clients. */
export const FIRST_PARTY_API_OAUTH_SCOPES = ["api:read", "api:write"] as const;
export const IOS_OAUTH_CLIENT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  ...FIRST_PARTY_API_OAUTH_SCOPES,
] as const;
export const IOS_OAUTH_REDIRECT_PATH = "/oauth/ios/callback";
export const OAUTH_AUTHORIZATION_TTL_SECONDS = 5 * 60;
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const OAUTH_API_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Maximum age of the sign-in behind an app token for destructive account operations. */
export const OAUTH_RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60;

export function isDynamicallyRegisteredOAuthClient(clientId: string) {
  return clientId !== FIRST_PARTY_OAUTH_CLIENT_ID && !isFirstPartyApiOAuthClient(clientId);
}

export function isFirstPartyApiOAuthClient(clientId: string | null | undefined) {
  return typeof clientId === "string" && FIRST_PARTY_API_OAUTH_CLIENT_IDS.includes(clientId);
}

export function isFirstPartyApiOAuthScope(scope: string) {
  return (FIRST_PARTY_API_OAUTH_SCOPES as readonly string[]).includes(scope);
}

export function iosOAuthRedirectUri(authUrl: string) {
  return new URL(IOS_OAUTH_REDIRECT_PATH, authUrl).toString();
}
