import type { SerpLanguage } from "./language-catalog";
import {
  type CountrySeed,
  canonicalKey,
  countrySeed,
  type LocationCandidate,
  type LocationLookup,
  type LocationSelector,
  type LocationStore,
  locationLanguage,
  type ResolvedLocation,
} from "./location";

// Resolves a location selector into a persisted, deduplicated location row.
// Country selectors are deterministic (offline seed). Region and city selectors
// go through a provider catalog and are cached by canonicalKey. An unresolved
// granular location degrades to country; create/edit callers reject that result.

export type LocationResolution = {
  location: ResolvedLocation;
  degraded: boolean;
  warning: string | null;
};

export type ResolveDeps = {
  store: LocationStore;
  lookup?: LocationLookup;
  trustedCandidate?: LocationCandidate;
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

  const kind =
    selector.kind ?? (selector.cityName ? "city" : selector.regionName ? "region" : "country");
  if (kind === "country") {
    const location = await getOrCreateCountry(countryCode, seed, language, deps.store);
    return { location, degraded: false, warning: null };
  }
  const name =
    kind === "region"
      ? selector.regionName?.trim() || selector.regionCode?.trim()
      : selector.cityName?.trim();
  if (!name) {
    const location = await getOrCreateCountry(countryCode, seed, language, deps.store);
    return {
      location,
      degraded: true,
      warning: `Could not resolve a ${kind} in ${seed.displayName}; tracking at country level.`,
    };
  }

  const candidate =
    deps.trustedCandidate ??
    (deps.lookup ? await deps.lookup.find({ ...selector, countryCode, kind }) : null);

  if (!candidate || !matchesSelector(candidate, selector, countryCode, kind)) {
    const location = await getOrCreateCountry(countryCode, seed, language, deps.store);
    return {
      location,
      degraded: true,
      warning: `Could not resolve "${name}" in ${seed.displayName}; tracking at country level.`,
    };
  }

  const key = canonicalKey({
    countryCode: candidate.countryCode,
    kind: candidate.kind,
    regionCode: candidate.regionCode,
    regionName: candidate.regionName,
    cityName: candidate.cityName,
    languageCode: language.code,
  });
  const cached = await deps.store.findByKey(key);
  if (cached) {
    const location = deps.store.enrich ? await deps.store.enrich(cached, candidate) : cached;
    return { location, degraded: false, warning: null };
  }

  const location = await persist(deps.store, {
    kind: candidate.kind,
    displayName: candidate.displayName,
    countryCode: candidate.countryCode,
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

function matchesSelector(
  candidate: LocationCandidate,
  selector: LocationSelector,
  countryCode: string,
  kind: LocationCandidate["kind"],
) {
  return (
    candidate.kind === kind &&
    candidate.countryCode.toUpperCase() === countryCode &&
    (!selector.selectedCanonicalKey ||
      canonicalKey({ ...candidate, languageCode: undefined }) ===
        canonicalKey({ ...selector, countryCode, kind, languageCode: undefined }))
  );
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
