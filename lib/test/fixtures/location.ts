import type { LocationSearchItem } from "@/lib/api/locations-search-contract";
import type { KeywordLocation } from "@/lib/queries/keyword-location";
import type { SharedLocationSuggestion as ProviderLocationSuggestion } from "@/lib/serp/common-location-catalog";
import type { ResolvedLocation } from "@/lib/serp/location";

export type UiLocationSuggestion = {
  canonicalKey: string;
  cityName?: string | null;
  countryCode: string;
  displayName: string;
  hl?: string;
  id?: string;
  kind: "country" | "region" | "city";
  languageCode?: string;
  languageLabel?: string;
  regionName?: string | null;
};

export function locationSearchWireCandidate(
  overrides: Partial<LocationSearchItem> = {},
): LocationSearchItem {
  return {
    canonical_key: "US",
    city_name: null,
    country_code: "US",
    display_name: "United States",
    hl: "en",
    id: "country:US",
    kind: "country",
    language_code: "en",
    language_label: "English",
    region_code: null,
    region_name: null,
    ...overrides,
  };
}

export function locationSuggestion(
  overrides: Partial<UiLocationSuggestion> = {},
): UiLocationSuggestion {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    hl: "en",
    id: "country:US",
    kind: "country",
    languageCode: "en",
    languageLabel: "English",
    regionName: null,
    ...overrides,
  };
}

export function providerLocationSuggestion(
  overrides: Partial<ProviderLocationSuggestion> = {},
): ProviderLocationSuggestion {
  return {
    canonicalKey: ["US", "Texas", "Austin"].join("/"),
    cityName: "Austin",
    countryCode: "US",
    displayName: "Austin, Texas, United States",
    kind: "city",
    primaryGeoCode: 1,
    primaryGeoName: "Austin, Texas, United States",
    regionCode: "US-TX",
    regionName: "Texas",
    secondaryGeoName: "Austin, Texas, United States",
    ...overrides,
  };
}

export function resolvedLocation(overrides: Partial<ResolvedLocation> = {}): ResolvedLocation {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
    languageCode: "en",
    languageLabel: "English",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    regionCode: null,
    secondaryGeoName: "United States",
    ...overrides,
  };
}

export function keywordLocation(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  const canonicalKey = overrides.canonicalKey ?? "US";
  return {
    canonicalKey,
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    kind: "country",
    languageLabel: "English",
    ...overrides,
    id: canonicalKey,
  };
}
