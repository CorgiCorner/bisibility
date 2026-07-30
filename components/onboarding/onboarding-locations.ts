import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { countryCodeForMarketName, countrySeed, parseCanonicalKey } from "@/lib/serp/location";
import { DEFAULT_SERP_MARKET, type SerpMarketName } from "@/lib/serp/markets";

export const MAX_ONBOARDING_LOCATIONS = 5;
export const DEFAULT_ONBOARDING_LOCATION_KEY =
  countryCodeForMarketName(DEFAULT_SERP_MARKET) ?? "US";

export type OnboardingLocationCandidate = {
  key: string;
  kind: "country" | "city";
};

function normalizeLocationKey(value: string): OnboardingLocationCandidate | null {
  const parsed = canonicalKeySchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const selector = parseCanonicalKey(parsed.data);
  if (!selector) {
    return null;
  }
  if (!selector.cityName) {
    return countrySeed(selector.countryCode)
      ? { key: selector.countryCode.toUpperCase(), kind: "country" }
      : null;
  }
  return { key: parsed.data, kind: "city" };
}

export function countryLocationKey(value: string | undefined | null) {
  return value ? countryCodeForMarketName(value) : null;
}

export function countryNameForLocationKey(key: string): SerpMarketName | null {
  const selector = parseCanonicalKey(key);
  const seed = selector ? countrySeed(selector.countryCode) : null;
  return seed ? (seed.displayName as SerpMarketName) : null;
}

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
