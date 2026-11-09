import { LEGACY_BEARER_PREFIXES, PERSONAL_TOKEN_PREFIX, PROJECT_API_KEY_PREFIX } from "./auth";

// An OAuth-authenticated POST /me/tokens is the PKCE login exchange for a
// long-lived personal access token.
export function isOauthExchangeRequest(method: string, path: string[], req: Request) {
  if (method !== "POST" || path[0] !== "me" || path[1] !== "tokens" || path.length !== 2) {
    return false;
  }
  const header = req.headers.get("authorization")?.trim() ?? "";
  const token = header.replace(/^bearer\s+/i, "").trim();
  return (
    token.length > 0 &&
    !token.startsWith(PERSONAL_TOKEN_PREFIX) &&
    !token.startsWith(PROJECT_API_KEY_PREFIX) &&
    !LEGACY_BEARER_PREFIXES.some((prefix) => token.startsWith(prefix))
  );
}
