import "server-only";

import { providerAccountKey } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { type GoogleFetchContext, googleApiFetch, refreshGoogleAccessToken } from "./google-client";
import { normalizeGa4PropertyId } from "./property-id";

const GA4_KEY_EVENTS_URL = "https://analyticsadmin.googleapis.com/v1alpha/properties";

type Ga4KeyEventsResponse = { keyEvents?: unknown };

function keyEventsUrl(propertyId: string) {
  return `${GA4_KEY_EVENTS_URL}/${encodeURIComponent(propertyId)}/keyEvents`;
}

function fetchContext(credentials: ProviderCredentials, property: string): GoogleFetchContext {
  return {
    accountKey: providerAccountKey("ga4", { apiKey: credentials.apiKey, login: property }),
    providerId: "ga4",
  };
}

/** Returns whether GA4 has any configured key events, or null when the Admin API is unknown. */
export async function readGa4KeyEventsConfigured(
  credentials: ProviderCredentials,
): Promise<boolean | null> {
  try {
    const normalized = normalizeGa4PropertyId(credentials.login ?? "");
    if (!normalized.ok) return null;
    const property = `properties/${normalized.value}`;
    const accessToken = await refreshGoogleAccessToken(
      credentials.apiKey,
      credentials.onRefreshToken,
    );
    const response = await googleApiFetch<Ga4KeyEventsResponse>(
      keyEventsUrl(normalized.value),
      accessToken,
      {},
      fetchContext(credentials, property),
    );
    if (!Array.isArray(response.keyEvents)) return null;
    return response.keyEvents.length > 0;
  } catch {
    // A failed listing is unknown, not false: false would tell customers they configured nothing.
    return null;
  }
}
