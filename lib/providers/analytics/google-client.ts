import { captureHttpResponse } from "@/lib/providers/provider-response";
import "server-only";

import { awaitWithSignal } from "@/lib/async/abort";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import {
  consumeProviderLimit,
  ProviderRateLimitedError,
  writeCooldown,
} from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { googleResponseError } from "./google-failure";
import {
  type GoogleApiErrorPayload,
  googleRateLimitScope,
  googleRetryAfterMs,
} from "./google-quota";
import {
  cachedGoogleToken,
  type GoogleTokenGrant,
  invalidateGoogleAccessToken,
  waitForGoogleToken,
} from "./google-token-cache";

// Shared GSC/GA4 client. Access tokens stay in memory; only refresh tokens are persisted.

export type GoogleProviderId = "gsc" | "ga4";

// GSC/GA4 data calls pass provider and account to enforce a shared account budget.
export type GoogleFetchContext = {
  captureResponse?: (status: number, body: unknown, url?: string) => Promise<void>;
  providerId: GoogleProviderId;
  accountKey: string;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const GA4_ACCOUNT_SUMMARIES_URL =
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200";

const GOOGLE_BASE_SCOPES = ["openid", "email"] as const;
// GSC scopes permit reads only, including sitemaps and URL inspections.
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export function googleAnalyticsScopes(provider: GoogleProviderId): readonly string[] {
  return [...GOOGLE_BASE_SCOPES, provider === "ga4" ? GA4_SCOPE : GSC_SCOPE];
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Connect reuses the social-login OAuth client (GOOGLE_CLIENT_ID/SECRET) with extra scopes.
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) {
    throw new Error("GOOGLE_CLIENT_ID is required to connect Google analytics.");
  }
  return value;
}

export function googleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) {
    throw new Error("GOOGLE_CLIENT_SECRET is required to connect Google analytics.");
  }
  return value;
}

export function googleRedirectUri(origin: string): string {
  return new URL("/api/integrations/google/callback", origin).toString();
}

type GoogleTokenPayload = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

async function postToken(
  body: URLSearchParams,
  signal?: AbortSignal,
): Promise<GoogleTokenPayload | null> {
  signal?.throwIfAborted();
  const response = await awaitWithSignal(
    () =>
      fetch(GOOGLE_TOKEN_URL, {
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        ...(signal ? { signal } : {}),
      }),
    signal,
  );
  const payload = (await awaitWithSignal(
    () => response.json().catch(() => null),
    signal,
  )) as GoogleTokenPayload | null;
  signal?.throwIfAborted();
  if (!response.ok) {
    throw googleResponseError(response.status, payload);
  }
  return payload;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const payload = await postToken(
    new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );
  const accessToken = stringValue(payload?.access_token);
  if (!accessToken) {
    throw new Error("Google OAuth exchange did not return an access token.");
  }
  return {
    accessToken,
    refreshToken: stringValue(payload?.refresh_token),
    scope: stringValue(payload?.scope),
  };
}

type GoogleUserInfoPayload = { email?: unknown };

export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_USER_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as GoogleUserInfoPayload | null;
  return stringValue(payload?.email);
}

export async function refreshGoogleAccessToken(
  refreshToken: string | undefined,
  persistRefreshToken?: (refreshToken: string) => Promise<void>,
  signal?: AbortSignal,
  cacheIdentity?: ProviderCredentials["tokenCacheIdentity"],
): Promise<string> {
  signal?.throwIfAborted();
  if (!refreshToken) {
    throw new ProviderAuthError(
      "google",
      "Google connection is missing a refresh token. Reconnect the account.",
    );
  }
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const exchange = async (exchangeSignal?: AbortSignal): Promise<GoogleTokenGrant> => {
    const startedAt = Date.now();
    const payload = await postToken(
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      exchangeSignal,
    );
    const accessToken = stringValue(payload?.access_token);
    if (!accessToken) throw new Error("Google token refresh did not return an access token.");
    const lifetime = payload?.expires_in;
    return {
      accessToken,
      expiresAt:
        typeof lifetime === "number" && Number.isSafeInteger(lifetime) && lifetime > 60
          ? startedAt + (Math.min(lifetime, 3600) - 60) * 1000
          : undefined,
      rotatedRefreshToken: stringValue(payload?.refresh_token),
    };
  };
  const pending = cacheIdentity
    ? cachedGoogleToken({ identity: cacheIdentity, refreshToken, clientId, clientSecret }, exchange)
    : exchange(signal);
  const persisted = pending.then(async (grant) => {
    if (grant.rotatedRefreshToken && grant.rotatedRefreshToken !== refreshToken) {
      try {
        await persistRefreshToken?.(grant.rotatedRefreshToken);
      } catch {
        console.error("[google] rotated refresh token persistence failed", {
          errorClass: "credential_persistence",
        });
      }
    }
    return grant.accessToken;
  });
  return waitForGoogleToken(persisted, signal);
}

export async function googleApiFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  context?: GoogleFetchContext,
  captureResponse?: GoogleFetchContext["captureResponse"],
): Promise<T> {
  init.signal?.throwIfAborted();
  if (context) {
    const gate = await awaitWithSignal(
      () =>
        consumeProviderLimit(context.providerId, undefined, {
          accountKey: context.accountKey,
        }),
      init.signal,
    );
    if (!gate.success) {
      throw new ProviderRateLimitedError(context.providerId, {
        accountKey: context.accountKey,
        resetAt: gate.resetAt,
      });
    }
  }

  init.signal?.throwIfAborted();
  const response = await awaitWithSignal(
    () =>
      fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      }),
    init.signal,
  );
  await captureHttpResponse(response, captureResponse ?? context?.captureResponse, url);
  const payload = (await awaitWithSignal(() => response.json().catch(() => null), init.signal)) as
    | (T & GoogleApiErrorPayload)
    | null;
  init.signal?.throwIfAborted();
  if (!response.ok) {
    if (response.status === 429 && context) {
      const resetAt = writeCooldown(context.accountKey);
      throw new ProviderRateLimitedError(context.providerId, {
        accountKey: context.accountKey,
        resetAt,
        retryAfterMs: googleRetryAfterMs(payload),
        scope: googleRateLimitScope(payload),
        source: "provider",
      });
    }
    const error = googleResponseError(response.status, payload, context?.providerId);
    if (response.status === 401 || error instanceof ProviderAuthError) {
      invalidateGoogleAccessToken(accessToken);
    }
    throw error;
  }
  return (payload ?? {}) as T;
}

export type GoogleSite = { permissionLevel: string; siteUrl: string };

export async function listGoogleSites(
  accessToken: string,
  signal?: AbortSignal,
): Promise<GoogleSite[]> {
  const data = await googleApiFetch<{
    siteEntry?: Array<{ permissionLevel?: unknown; siteUrl?: unknown }>;
  }>(GSC_SITES_URL, accessToken, { signal });

  return (data.siteEntry ?? [])
    .map((entry) => ({
      permissionLevel: stringValue(entry.permissionLevel) ?? "",
      siteUrl: stringValue(entry.siteUrl) ?? "",
    }))
    .filter((entry) => entry.siteUrl);
}

export type Ga4PropertySummary = {
  accountDisplayName: string;
  displayName: string;
  propertyId: string;
};

type Ga4AccountSummariesPage = {
  accountSummaries?: Array<{
    displayName?: unknown;
    propertySummaries?: Array<{ displayName?: unknown; property?: unknown }>;
  }>;
  nextPageToken?: unknown;
};

export async function listGa4Properties(accessToken: string): Promise<Ga4PropertySummary[]> {
  const properties: Ga4PropertySummary[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(GA4_ACCOUNT_SUMMARIES_URL);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data: Ga4AccountSummariesPage = await googleApiFetch<Ga4AccountSummariesPage>(
      url.toString(),
      accessToken,
    );
    for (const account of data.accountSummaries ?? []) {
      const accountDisplayName = stringValue(account.displayName) ?? "Google Analytics account";
      for (const summary of account.propertySummaries ?? []) {
        const property = stringValue(summary.property);
        const match = property ? /^properties\/(\d+)$/.exec(property) : null;
        if (!match) continue;
        properties.push({
          accountDisplayName,
          displayName: stringValue(summary.displayName) ?? `Property ${match[1]}`,
          propertyId: match[1],
        });
      }
    }
    pageToken = stringValue(data.nextPageToken);
  } while (pageToken);

  return properties;
}
