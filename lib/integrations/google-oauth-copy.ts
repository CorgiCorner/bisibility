import { type GoogleOAuthFailureReason, isGoogleOAuthFailureReason } from "./google-oauth-failure";

/**
 * A single remedy for every Google OAuth failure is wrong for most of them: telling a user to
 * "try again with the account that owns the property" after our own token exchange fell over
 * sends them chasing a permission problem they do not have. Reasons we can explain get honest
 * copy; anything unmapped or unknown keeps the caller's existing generic sentence.
 */
const REASON_COPY: Partial<Record<GoogleOAuthFailureReason, string>> = {
  // The generic copy is about the Google account; this failure is about the bisibility session,
  // so falling through would send the user after a property permission they already have.
  actor_mismatch:
    "You finished the Google sign-in while signed in to a different bisibility account. Sign back in to the account that started the connection, then try again.",
  google_denied: "Google reported the connection was declined.",
  no_refresh_token: "Google did not return a refresh token. Remove app access and reconnect.",
  state_cookie_mismatch:
    "The sign-in flow expired or was restarted. Try again once, in a single tab.",
  state_expired: "The sign-in flow expired or was restarted. Try again once, in a single tab.",
  store_failed:
    "Google sign-in worked but our server could not finish the connection. This is on us - retry, and contact us if it repeats.",
  token_exchange:
    "Google sign-in worked but our server could not finish the connection. This is on us - retry, and contact us if it repeats.",
};

export function googleOAuthErrorCopy(reason: string | null | undefined, fallback: string) {
  if (!isGoogleOAuthFailureReason(reason)) {
    return fallback;
  }
  return REASON_COPY[reason] ?? fallback;
}
