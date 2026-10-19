import "server-only";

import {
  isFirstPartyApiOAuthClient,
  OAUTH_RECENT_AUTH_MAX_AGE_SECONDS,
} from "@/lib/auth/oauth-policy";
import type { ApiAuth } from "./auth";
import { errorResponse } from "./responses";
import type { ApiScope } from "./scope-policy";

const CLOCK_SKEW_MS = 60_000;

/** True for a request authenticated by a first-party app OAuth token (ADR-021). */
export function isAppOAuthAuth(auth: ApiAuth) {
  return auth.kind === "personal_token" && isFirstPartyApiOAuthClient(auth.oauthClientId);
}

/**
 * Destructive account operations from the app need a sign-in from the last 10 minutes; the app
 * gets one by repeating authorization with `prompt=login`. A missing sign-in time fails closed;
 * one minute of clock skew between server instances is tolerated. Other credentials are governed by their scopes and return null here.
 */
export function requireRecentOAuthAuthentication(
  auth: ApiAuth,
  init: { headers?: Headers; instance: string },
  now = new Date(),
) {
  if (!isAppOAuthAuth(auth) || auth.kind !== "personal_token") return null;
  const authTime = auth.authTime?.getTime();
  const age = authTime === undefined ? Number.NaN : now.getTime() - authTime;
  if (age >= -CLOCK_SKEW_MS && age <= OAUTH_RECENT_AUTH_MAX_AGE_SECONDS * 1000) return null;
  return errorResponse("forbidden", "Sign in again to confirm this action.", 403, {
    headers: init.headers,
    instance: init.instance,
    problemDetails: {
      code: "reauthentication_required",
      max_age_seconds: OAUTH_RECENT_AUTH_MAX_AGE_SECONDS,
    },
  });
}

/** Account operations an app token may perform only right after signing in again. */
export function requiresRecentAppAuthentication(method: string, path: readonly string[]) {
  return method === "DELETE" && path.length === 1 && path[0] === "me";
}

export function recentAppAuthenticationResponse(
  auth: ApiAuth,
  method: string,
  path: readonly string[],
  headers: Headers,
  url: URL,
) {
  if (!requiresRecentAppAuthentication(method, path)) return null;
  return requireRecentOAuthAuthentication(auth, {
    headers,
    instance: `urn:bisibility:api:v1:${url.pathname}`,
  });
}

/** App account deletion uses api:write; personal tokens retain the declared admin scope. */
export function appRequiredScope(auth: ApiAuth, operationId: string, declared: ApiScope): ApiScope {
  return isAppOAuthAuth(auth) && operationId === "deleteMe" ? "write" : declared;
}
