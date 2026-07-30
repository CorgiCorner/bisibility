import { decryptProviderCredentials } from "./crypto";
import type { ProviderCredentials } from "./types";

function hasUsableCredentials(creds: ProviderCredentials) {
  return Boolean(creds.apiKey || (creds.login && creds.password));
}

// Env credentials are a local/self-host fallback only when no encrypted
// per-project credentials exist.
function envCredentials(providerId: string): ProviderCredentials {
  if (providerId === "serpapi") {
    const apiKey = process.env.SERPAPI_API_KEY;
    return apiKey ? { apiKey } : {};
  }

  if (providerId === "dataforseo") {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    return login && password ? { login, password } : {};
  }

  return {};
}

/**
 * Prefer encrypted project credentials; malformed stored secrets never fall back to env.
 */
export function resolveProviderCredentials(
  providerId: string,
  encrypted: string | null | undefined,
): ProviderCredentials {
  const stored = decryptProviderCredentials(encrypted);
  if (hasUsableCredentials(stored)) {
    return stored;
  }

  return envCredentials(providerId);
}

/**
 * Layer input over stored secrets; env fallback applies only when both are empty.
 */
export function resolveProviderCredentialsWithOverrides(
  providerId: string,
  encrypted: string | null | undefined,
  overrides: ProviderCredentials,
): ProviderCredentials {
  const merged = { ...decryptProviderCredentials(encrypted), ...overrides };
  if (hasUsableCredentials(merged) || Object.keys(overrides).length > 0) {
    return merged;
  }

  return envCredentials(providerId);
}
