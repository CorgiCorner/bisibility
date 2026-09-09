import { canonicalKeySchema } from "@/lib/schemas/keyword";
import {
  countryCodeForMarketName,
  countrySeed,
  normalizeCanonicalLocationKey,
} from "@/lib/serp/location";

export { MAX_PROJECT_MARKETS as MAX_ONBOARDING_LOCATIONS } from "@/lib/markets/limits";
export const DEFAULT_ONBOARDING_LOCATION_KEY = "US";

export type OnboardingLocationCandidate = {
  key: string;
  kind: "country" | "city";
};

function normalizeLocationKey(value: string): OnboardingLocationCandidate | null {
  const parsed = canonicalKeySchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const normalized = normalizeCanonicalLocationKey(parsed.data);
  const selector = normalized.selector;
  if (!selector.cityName) {
    return countrySeed(selector.countryCode)
      ? { key: normalized.canonicalKey, kind: "country" }
      : null;
  }
  return { key: normalized.canonicalKey, kind: "city" };
}

export function countryLocationKey(value: string | undefined | null) {
  return value ? countryCodeForMarketName(value) : null;
}

/** Compatibility reader for persisted project-default names. UI state remains a location key. */
export function legacyCountryLocationCandidates(values: readonly string[] | undefined) {
  return (values ?? []).flatMap((value) => {
    const key = countryLocationKey(value);
    return key ? [{ key, kind: "country" as const }] : [];
  });
}

export function onboardingLocationCandidates(values: readonly string[] | undefined) {
  return (values ?? []).flatMap((value) => {
    const candidate = normalizeLocationKey(value);
    return candidate ? [candidate] : [];
  });
}

export function uniqueLocationCandidates(
  candidates: readonly OnboardingLocationCandidate[],
): OnboardingLocationCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.key)) {
      return false;
    }
    seen.add(candidate.key);
    return true;
  });
}

export function locationSelectionInputForKey(key: string) {
  return { locationKey: key };
}
