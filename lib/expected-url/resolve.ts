import { preferredHreflangAlternate } from "./hreflang";
import type { ExpectedUrlResolution, ExpectedUrlResolverInput } from "./types";

function acceptedTargetUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function canonicalTarget(input: ExpectedUrlResolverInput) {
  const defaultRow = input.defaultLocationKey
    ? input.canonicalRows.find((row) => row.canonicalKey === input.defaultLocationKey)
    : null;
  const defaultTarget = acceptedTargetUrl(defaultRow?.targetUrl);
  if (defaultTarget) return defaultTarget;
  return input.canonicalRows.map((row) => acceptedTargetUrl(row.targetUrl)).find(Boolean) ?? null;
}

function fetchableCanonical(value: string | null, canonicalBaseUrl: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, canonicalBaseUrl ?? undefined);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function resolveExpectedUrl(
  input: ExpectedUrlResolverInput,
): Promise<ExpectedUrlResolution> {
  const explicit = acceptedTargetUrl(input.row.targetUrl);
  if (input.row.targetUrl && !explicit) {
    input.logger({ reason: "invalid_explicit_url", url: input.row.targetUrl });
  }
  if (explicit) return { source: "explicit", url: explicit };

  const canonical = canonicalTarget(input);
  const fetchable = fetchableCanonical(canonical, input.canonicalBaseUrl);
  if (!fetchable) return { source: canonical ? "canonical" : null, url: canonical };
  try {
    const document = await input.fetchDocument(fetchable);
    if (document) {
      const alternate = preferredHreflangAlternate({
        allowedHosts: input.allowedHosts,
        baseUrl: document.url,
        countryCode: input.row.countryCode,
        document: document.body,
        languageCode: input.row.languageCode,
        logger: input.logger,
      });
      if (alternate) return { source: "hreflang", url: alternate };
    }
  } catch (error) {
    input.logger({
      error: error instanceof Error ? error.message : String(error),
      reason: "resolver_fetch_failed",
      url: fetchable,
    });
  }
  return { source: canonical ? "canonical" : null, url: canonical };
}
