import type { SerpLanguage } from "./language-catalog";
import {
  type CityLocationLookup,
  type CountrySeed,
  canonicalKey,
  countrySeed,
  type LocationSelector,
  type LocationStore,
  locationLanguage,
  type ResolvedLocation,
} from "./location";

// Resolves a location selector into a persisted, deduplicated location row.
// Country selectors are deterministic (offline seed). City selectors go through
// a provider lookup and are cached by canonicalKey. Unresolved cities DEGRADE to
// the country row with a warning - the create/edit caller decides how to surface
// it; the runner/adapter path must never throw on stored data (design §5).

export type LocationResolution = {
  location: ResolvedLocation;
  degraded: boolean;
  warning: string | null;
};

export type ResolveDeps = {
  store: LocationStore;
  lookup?: CityLocationLookup;
};

export async function resolveLocation(
  selector: LocationSelector,
  deps: ResolveDeps,
): Promise<LocationResolution> {
  const countryCode = selector.countryCode.trim().toUpperCase();
  const seed = countrySeed(countryCode);
  if (!seed) {
    throw new Error(`Unsupported country: ${selector.countryCode}`);
  }
  const language = locationLanguage(countryCode, selector.languageCode);

  const cityName = selector.cityName?.trim();
  if (!cityName) {
    const location = await getOrCreateCountry(countryCode, seed, language, deps.store);
    return { location, degraded: false, warning: null };
  }

  const candidate = deps.lookup
    ? await deps.lookup.findCity({
        cityName,
        countryCode,
        regionCode: selector.regionCode,
        regionName: selector.regionName,
      })
    : null;

  if (!candidate) {
    const location = await getOrCreateCountry(countryCode, seed, language, deps.store);
    return {
      location,
      degraded: true,
      warning: `Could not resolve "${cityName}" in ${seed.displayName}; tracking at country level.`,
    };
  }

  const key = canonicalKey({
    countryCode,
    regionCode: candidate.regionCode,
    regionName: candidate.regionName,
    cityName: candidate.cityName,
    languageCode: language.code,
  });
  const cached = await deps.store.findByKey(key);
  if (cached) {
    return { location: cached, degraded: false, warning: null };
  }

  const location = await persist(deps.store, {
    kind: "city",
    displayName: candidate.displayName,
    countryCode,
    regionCode: candidate.regionCode,
    cityName: candidate.cityName,
    gl: seed.gl,
    hl: language.code,
    languageCode: language.code,
    languageLabel: language.label,
    primaryGeoCode: candidate.primaryGeoCode,
    primaryGeoName: candidate.primaryGeoName,
    secondaryGeoName: candidate.secondaryGeoName,
    canonicalKey: key,
  });
  return { location, degraded: false, warning: null };
}

async function getOrCreateCountry(
  countryCode: string,
  seed: CountrySeed,
  language: SerpLanguage,
  store: LocationStore,
): Promise<ResolvedLocation> {
  const key = canonicalKey({ countryCode, languageCode: language.code });
  const cached = await store.findByKey(key);
  if (cached) {
    return cached;
  }
  return persist(store, {
    kind: "country",
    displayName: seed.displayName,
    countryCode,
    regionCode: null,
    cityName: null,
    gl: seed.gl,
    hl: language.code,
    languageCode: language.code,
    languageLabel: language.label,
    // Country queries use the country name on both providers (matches prior
    // behavior); numeric codes only matter for disambiguating cities.
    primaryGeoCode: null,
    primaryGeoName: seed.displayName,
    secondaryGeoName: seed.displayName,
    canonicalKey: key,
  });
}

// Concurrent resolutions can race on unique canonicalKey; re-read the winner
// instead of surfacing the losing create as a conflict.
async function persist(
  store: LocationStore,
  row: Omit<ResolvedLocation, "id">,
): Promise<ResolvedLocation> {
  try {
    return await store.create(row);
  } catch (error) {
    const existing = await store.findByKey(row.canonicalKey);
    if (existing) {
      return existing;
    }
    throw error;
  }
}
