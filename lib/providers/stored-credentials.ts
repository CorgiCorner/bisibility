import { decryptProviderCredentials } from "./crypto";

/**
 * Whether credential resolution would use the stored value instead of the environment fallback
 * (see `resolveProviderCredentials`). A malformed stored value counts as present: resolving it
 * fails instead of falling back.
 */
export function storedProviderCredentialsPresent(encrypted: string | null | undefined): boolean {
  try {
    const stored = decryptProviderCredentials(encrypted);
    return Boolean(stored.apiKey || (stored.login && stored.password));
  } catch {
    return true;
  }
}
