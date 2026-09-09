import { fetchLocationSearchItems } from "@/components/keywords/location-picker-data";
import {
  allMarketLanguages,
  recommendedMarketLanguages,
} from "@/components/markets/market-picker-model";
import type { NormalizedLocationSearchItem } from "@/lib/api/locations-search-contract";
import { serpCountryByCode, serpCountryCatalog } from "@/lib/serp/country-catalog";
import {
  baseLocationKey,
  type MarketDefinitionCountry,
  type MarketDefinitionLanguage,
  type MarketDefinitionLocation,
} from "./market-definition-selection";

/**
 * Where a MarketDefinition gets its choices. The block takes this as a dependency so every host
 * offers the same countries, languages and places: countries and languages from the bundled
 * catalogs, regions and cities from the shared location catalog through location search.
 * Suggestions do not require provider credentials and do not run SERP queries.
 */
export type MarketDefinitionLocationSource = {
  countries: readonly MarketDefinitionCountry[];
  languagesFor: (countryCode: string) => {
    all: readonly MarketDefinitionLanguage[];
    suggested: readonly MarketDefinitionLanguage[];
  };
  searchLocations: (
    query: string,
    countryCode: string,
    signal: AbortSignal,
  ) => Promise<readonly MarketDefinitionLocation[]>;
};

const bundledCountries: readonly MarketDefinitionCountry[] = serpCountryCatalog
  .map((country) => ({ code: country.countryCode, label: country.displayName }))
  .sort((left, right) => left.label.localeCompare(right.label, "en"));

function subLocation(item: NormalizedLocationSearchItem): MarketDefinitionLocation | null {
  if (item.kind === "country") return null;
  return {
    canonicalKey: baseLocationKey(item.canonical_key),
    countryCode: item.country_code,
    displayName: item.display_name,
    kind: item.kind,
  };
}

/** Regions and cities of one country from a search response, one option per place. */
export function subLocationsFrom(
  items: readonly NormalizedLocationSearchItem[],
  countryCode: string,
): MarketDefinitionLocation[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const location = subLocation(item);
    if (!location || location.countryCode !== countryCode || seen.has(location.canonicalKey)) {
      return [];
    }
    seen.add(location.canonicalKey);
    return [location];
  });
}

export function catalogMarketDefinitionSource(
  projectId: string | null,
): MarketDefinitionLocationSource {
  return {
    countries: bundledCountries,
    languagesFor: (countryCode) => {
      if (!serpCountryByCode(countryCode)) return { all: [], suggested: [] };
      return {
        all: allMarketLanguages({ countryCode }),
        suggested: recommendedMarketLanguages({ countryCode }),
      };
    },
    searchLocations: async (query, countryCode, signal) =>
      subLocationsFrom(
        await fetchLocationSearchItems(query, { country: countryCode, projectId, signal }),
        countryCode,
      ),
  };
}
