import { countrySeed, locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { researchCountryLocationCode, supportsResearchScope } from "@/lib/serp/research-capability";

export type ResearchScope = {
  countryCode: string;
  countryName: string;
  languageCode: string;
  languageLabel: string;
  providerLocationCode: number | null;
  researchAvailable: boolean;
};

type ResearchScopeLocation = {
  countryCode: string;
  languageCode: string;
  languageLabel: string;
};

function normalizedPair(location: ResearchScopeLocation) {
  return {
    countryCode: location.countryCode.trim().toUpperCase(),
    languageCode: location.languageCode.trim().toLowerCase(),
  };
}

export function researchScopeForLocation(location: ResearchScopeLocation): ResearchScope {
  const { countryCode, languageCode } = normalizedPair(location);
  return {
    countryCode,
    countryName: countrySeed(countryCode)?.displayName ?? countryCode,
    languageCode,
    languageLabel: location.languageLabel,
    providerLocationCode: researchCountryLocationCode(countryCode),
    researchAvailable: supportsResearchScope(countryCode, languageCode),
  };
}

export function researchScopeForLocationKey(locationKey: string): ResearchScope {
  const location = normalizeCanonicalLocationKey(locationKey);
  const countryCode = location.selector.countryCode;
  const language = locationLanguage(countryCode, location.selector.languageCode);
  return researchScopeForLocation({
    countryCode,
    languageCode: language.code,
    languageLabel: language.label,
  });
}

export function researchScopeForStoredLocationKey(locationKey: string, fallback: ResearchScope) {
  try {
    return researchScopeForLocationKey(locationKey);
  } catch {
    return fallback;
  }
}

export function researchScopeKey(
  scope: Pick<ResearchScope, "countryCode" | "languageCode">,
): string {
  return `${scope.countryCode.trim().toUpperCase()}:${scope.languageCode.trim().toLowerCase()}`;
}

export function researchScopeOptionsForProject(
  markets: readonly ResearchScopeLocation[],
): ResearchScope[] {
  const scopes = new Map<string, ResearchScope>();
  for (const location of markets) {
    const scope = researchScopeForLocation(location);
    const key = researchScopeKey(scope);
    if (!scopes.has(key)) scopes.set(key, scope);
  }
  return [...scopes.values()];
}
