import "server-only";

import { resolveProviderCredentials } from "@/lib/providers/credentials";
import type { ProviderCredentials } from "@/lib/providers/types";
import type { CityLocationLookup } from "./location";
import {
  DEFAULT_LOCATION_SUGGEST_LIMIT,
  fetchDataForSeoSuggestions,
  fetchSerpApiSuggestions,
  type LocationSuggestInput,
  type LocationSuggestion,
  type LookupOptions,
  normalizeLocationLookupName,
  type ScoredSuggestion,
} from "./location-lookup-providers";

export type {
  LocationSuggestInput,
  LocationSuggestion,
} from "./location-lookup-providers";
export { clearLocationLookupCacheForTests } from "./location-lookup-providers";

export type ProviderLookupConfig = {
  dataForSeo?: ProviderCredentials;
  serpApi?: boolean;
};

function mergeSuggestions(items: ScoredSuggestion[], limit: number): LocationSuggestion[] {
  const byKey = new Map<string, ScoredSuggestion>();
  for (const item of items) {
    const existing = byKey.get(item.canonicalKey);
    if (!existing) {
      byKey.set(item.canonicalKey, item);
      continue;
    }
    byKey.set(item.canonicalKey, {
      ...existing,
      exactness: Math.min(existing.exactness, item.exactness),
      primaryGeoCode: existing.primaryGeoCode ?? item.primaryGeoCode,
      primaryGeoName: item.primaryGeoCode ? item.primaryGeoName : existing.primaryGeoName,
      reach: Math.max(existing.reach, item.reach),
      secondaryGeoName: item.secondaryGeoName.includes(",")
        ? item.secondaryGeoName
        : existing.secondaryGeoName,
    });
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        a.exactness - b.exactness ||
        b.reach - a.reach ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit)
    .map(({ exactness: _exactness, reach: _reach, ...candidate }) => candidate);
}

export async function suggestLocations(
  input: LocationSuggestInput,
  config: ProviderLookupConfig = {},
  options: LookupOptions = {},
): Promise<LocationSuggestion[]> {
  const query = input.query.trim();
  if (!query) {
    return [];
  }
  const limit = input.limit ?? DEFAULT_LOCATION_SUGGEST_LIMIT;
  const countryCode = input.countryCode?.trim().toUpperCase() || null;
  const [dataForSeo, serpApi] = await Promise.all([
    config.dataForSeo && countryCode
      ? fetchDataForSeoSuggestions({ countryCode, query }, config.dataForSeo, options)
      : Promise.resolve([]),
    config.serpApi ? fetchSerpApiSuggestions({ countryCode, limit, query }, options) : [],
  ]);
  return mergeSuggestions([...dataForSeo, ...serpApi], limit);
}

function pickBestSuggestion(
  suggestions: LocationSuggestion[],
  input: { regionCode?: string | null; regionName?: string | null; cityName: string },
) {
  const city = normalizeLocationLookupName(input.cityName);
  const region = normalizeLocationLookupName(input.regionName ?? input.regionCode ?? "");
  const exactCities = suggestions.filter(
    (candidate) => normalizeLocationLookupName(candidate.cityName) === city,
  );
  if (!region) {
    return exactCities[0] ?? suggestions[0] ?? null;
  }
  return (
    exactCities.find(
      (candidate) =>
        normalizeLocationLookupName(candidate.regionName ?? candidate.regionCode ?? "") === region,
    ) ??
    exactCities[0] ??
    suggestions[0] ??
    null
  );
}

export function createCityLocationLookup(
  config: ProviderLookupConfig,
  options: LookupOptions = {},
): CityLocationLookup {
  return {
    async findCity(input) {
      const suggestions = await suggestLocations(
        {
          countryCode: input.countryCode,
          limit: DEFAULT_LOCATION_SUGGEST_LIMIT,
          query: input.cityName,
        },
        config,
        options,
      );
      return pickBestSuggestion(suggestions, input);
    },
  };
}

type ConnectionRow = { provider: string; credentialsEncrypted: string | null };

export function lookupConfigFromConnections(connections: ConnectionRow[]): ProviderLookupConfig {
  const config: ProviderLookupConfig = {};
  for (const connection of connections) {
    if (connection.provider === "dataforseo") {
      const creds = resolveProviderCredentials("dataforseo", connection.credentialsEncrypted);
      if (creds.login && creds.password) {
        config.dataForSeo = creds;
      }
    }
    if (connection.provider === "serpapi") {
      config.serpApi = true;
    }
  }
  return config;
}
