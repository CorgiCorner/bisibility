import "server-only";

import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderHttpError } from "@/lib/providers/failure-class";
import {
  consumeProviderLimit,
  ProviderRateLimitedError,
  writeCooldown,
} from "@/lib/providers/rate-limit";

// Shared runtime client for the Google analytics adapters (GSC + GA4). The OAuth
// connect flow stores a refresh token; adapters mint short-lived access tokens on
// demand here so no access token is ever persisted.

export type GoogleProviderId = "gsc" | "ga4";

type GoogleApiErrorPayload = {
  error?: {
    errors?: Array<{ reason?: unknown }>;
    message?: unknown;
    status?: unknown;
  };
};

// Single chokepoint context: every GSC/GA4 data call passes provider + account
// key so this module enforces one shared per-account budget.
export type GoogleFetchContext = {
  providerId: GoogleProviderId;
  accountKey: string;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const GA4_ACCOUNT_SUMMARIES_URL =
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200";

const GOOGLE_BASE_SCOPES = ["openid", "email"] as const;
// Read-only webmasters: the app only reads properties, search analytics, sitemap
// status, and URL inspection results - there is no sitemap-submit feature.
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export function googleAnalyticsScopes(provider: GoogleProviderId): readonly string[] {
  return [...GOOGLE_BASE_SCOPES, provider === "ga4" ? GA4_SCOPE : GSC_SCOPE];
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function googleRateLimitScope(payload: GoogleApiErrorPayload | null) {
  const reasons =
    payload?.error?.errors
      ?.map((error) => stringValue(error.reason)?.toLowerCase())
      .filter((reason): reason is string => Boolean(reason)) ?? [];
  const status = stringValue(payload?.error?.status)?.toLowerCase();
  const signals = status ? [...reasons, status] : reasons;
  if (signals.some((signal) => signal.includes("daily"))) return "daily" as const;
  if (signals.some((signal) => signal.includes("ratelimitexceeded") || signal.includes("minute"))) {
    return "minute" as const;
  }
  return "unknown" as const;
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
  refresh_token?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function tokenError(payload: GoogleTokenPayload | null, fallback: string): string {
  const reason = stringValue(payload?.error_description) ?? stringValue(payload?.error);
  return reason ? `${fallback}: ${reason}.` : `${fallback}.`;
}

async function postToken(
  body: URLSearchParams,
  options: { invalidGrantIsAuthError?: boolean } = {},
): Promise<GoogleTokenPayload | null> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as GoogleTokenPayload | null;
  if (!response.ok) {
    if (options.invalidGrantIsAuthError && stringValue(payload?.error) === "invalid_grant") {
      throw new ProviderAuthError("google");
    }
    throw new ProviderHttpError(
      response.status,
      tokenError(payload, "Google token request failed"),
    );
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

export async function refreshGoogleAccessToken(
  refreshToken: string | undefined,
  persistRefreshToken?: (refreshToken: string) => Promise<void>,
): Promise<string> {
  if (!refreshToken) {
    throw new ProviderAuthError(
      "google",
      "Google connection is missing a refresh token. Reconnect the account.",
    );
  }
  const payload = await postToken(
    new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    { invalidGrantIsAuthError: true },
  );
  const accessToken = stringValue(payload?.access_token);
  if (!accessToken) {
    throw new Error("Google token refresh did not return an access token.");
  }
  const rotatedRefreshToken = stringValue(payload?.refresh_token);
  if (rotatedRefreshToken && rotatedRefreshToken !== refreshToken) {
    try {
      await persistRefreshToken?.(rotatedRefreshToken);
    } catch {
      console.error("[google] rotated refresh token persistence failed", {
        errorClass: "credential_persistence",
      });
    }
  }
  return accessToken;
}

export async function googleApiFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  context?: GoogleFetchContext,
): Promise<T> {
  if (context) {
    const gate = await consumeProviderLimit(context.providerId, undefined, {
      accountKey: context.accountKey,
    });
    if (!gate.success) {
      throw new ProviderRateLimitedError(context.providerId, {
        accountKey: context.accountKey,
        resetAt: gate.resetAt,
      });
    }
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as (T & GoogleApiErrorPayload) | null;
  if (!response.ok) {
    if (response.status === 401) {
      throw new ProviderAuthError(context?.providerId ?? "google");
    }
    if (response.status === 429 && context) {
      const resetAt = writeCooldown(context.accountKey);
      throw new ProviderRateLimitedError(context.providerId, {
        accountKey: context.accountKey,
        resetAt,
        scope: googleRateLimitScope(payload),
        source: "provider",
      });
    }
    const message = stringValue(payload?.error?.message);
    throw new ProviderHttpError(
      response.status,
      message ?? `Google API request failed with status ${response.status}.`,
    );
  }
  return (payload ?? {}) as T;
}

export type GoogleSite = { permissionLevel: string; siteUrl: string };

export async function listGoogleSites(accessToken: string): Promise<GoogleSite[]> {
  const data = await googleApiFetch<{
    siteEntry?: Array<{ permissionLevel?: unknown; siteUrl?: unknown }>;
  }>(GSC_SITES_URL, accessToken);

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
