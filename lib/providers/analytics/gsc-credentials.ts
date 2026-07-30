import { ProviderConfigurationError } from "@/lib/providers/failure-class";
import type { ProviderCredentials } from "@/lib/providers/types";
import { normalizeStoredGscProperty } from "./property-id";

export function readGscCredentials(creds: ProviderCredentials) {
  if (!creds.login?.trim()) {
    throw new Error("Google Search Console connection is missing a site. Reconnect the account.");
  }
  const normalized = normalizeStoredGscProperty(creds.login);
  if (!normalized.ok) {
    throw new ProviderConfigurationError(normalized.error.message);
  }
  return { property: normalized.value, refreshToken: creds.apiKey };
}
