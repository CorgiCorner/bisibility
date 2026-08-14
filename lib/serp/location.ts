import { resolveSerpLanguage, type SerpLanguage } from "./language-catalog";
import {
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  resolveSerpMarket,
  serpMarkets,
} from "./markets";

// Neutral, vendor-free location model. A tracked location is a country, region,
// or city. All provider-specific handles are neutralized to primary/secondary
// geo fields and translated to vendor params inside the adapters (CLAUDE.md).

export type LocationKind = "country" | "region" | "city";

export type ResolvedLocation = {
  id: string;
  kind: LocationKind;
  displayName: string; // "Austin, Texas, United States" | "United States"
  countryCode: string; // ISO-3166-1 alpha-2, upper
  regionCode: string | null; // ISO-3166-2, e.g. "US-TX"
  cityName: string | null;
  gl: string; // Google geo hint, e.g. "us"
  hl: string; // Google UI language, e.g. "en"
  languageCode: string; // normalized market language, e.g. "en"
  languageLabel: string; // "English"
  primaryGeoCode: number | null; // numeric geo id for the code-based provider
  primaryGeoName: string; // exact hierarchical name for the code-based provider
  secondaryGeoName: string; // exact canonical string for the name-based provider
  canonicalKey: string; // dedup/cache key: "US" | "US/US-TX/Austin"
};

export type LocationSelector = {
  countryCode: string;
  languageCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  cityName?: string | null;
};

export type LocationSelection =
  | { kind: "country"; countryCode: string; languageCode?: string | null }
  | { kind: "city"; canonicalKey: string }
  | {
      kind: "city";
      countryCode: string;
      languageCode?: string | null;
      regionName?: string | null;
      cityName: string;
    };

// A city match returned by a provider location lookup. Carries the neutral
// handles the adapters need; the resolver decides caching/persistence.
export type CityCandidate = {
  displayName: string;
  regionCode: string | null;
  regionName?: string | null;
  cityName: string;
  primaryGeoCode: number | null;
  primaryGeoName: string;
  secondaryGeoName: string;
};

// Persistence boundary for cached location rows (backed by Prisma in M2+).
export interface LocationStore {
  findByKey(canonicalKey: string): Promise<ResolvedLocation | null>;
  // Implement with a canonicalKey upsert; the resolver re-reads after create races.
  create(row: Omit<ResolvedLocation, "id">): Promise<ResolvedLocation>;
}

// Provider-backed city search (implemented per adapter in M3+).
export interface CityLocationLookup {
  findCity(input: {
    countryCode: string;
    regionCode?: string | null;
    regionName?: string | null;
    cityName: string;
  }): Promise<CityCandidate | null>;
}

export type CountrySeed = {
  countryCode: string;
  displayName: string;
  gl: string;
  hl: string;
  languageCode: string;
  languageLabel: string;
};

const countrySeeds = new Map<string, CountrySeed>(
  serpMarkets.map((market) => {
    const countryCode = market.google.gl.toUpperCase();
    return [
      countryCode,
      {
        countryCode,
        displayName: market.name,
        gl: market.google.gl,
        hl: market.language.code,
        languageCode: market.language.code,
        languageLabel: market.language.label,
      },
    ];
  }),
);

/** Country-level seed for a supported ISO alpha-2 code (offline, deterministic). */
export function countrySeed(countryCode: string): CountrySeed | null {
  return countrySeeds.get(countryCode.trim().toUpperCase()) ?? null;
}

/** Maps a legacy market name/alias (e.g. "United States", "usa") to its ISO code. */
export function countryCodeForMarketName(value: string): string | null {
  const name = normalizeSerpMarketName(value);
  if (!name) {
    return null;
  }
  return resolveSerpMarket(name).google.gl.toUpperCase();
}

function normalizePart(value: string) {
  return value.trim().replace(/\s+/g, " ").replaceAll("/", " ");
}

export class LocationInputError extends Error {
  readonly field: "canonicalKey" | "languageCode";

  constructor(field: "canonicalKey" | "languageCode", message: string) {
    super(message);
    this.name = "LocationInputError";
    this.field = field;
  }
}

function selectedLanguage(countryCode: string, languageCode?: string | null): SerpLanguage | null {
  const seed = countrySeed(countryCode);
  const requested = languageCode?.trim() || seed?.languageCode;
  return requested ? resolveSerpLanguage(requested) : null;
}

export function locationLanguage(countryCode: string, languageCode?: string | null): SerpLanguage {
  const language = selectedLanguage(countryCode, languageCode);
  if (!language) {
    throw new LocationInputError(
      "languageCode",
      `Unsupported language: ${languageCode?.trim() || "(missing)"}`,
    );
  }
  return language;
}

/** Stable dedup key. Country: "US". City: "US/US-TX/Austin" or "US/Texas/Austin". */
export function canonicalKey(selector: LocationSelector): string {
  const country = selector.countryCode.trim().toUpperCase();
  const city = selector.cityName ? normalizePart(selector.cityName) : "";
  let key = country;
  if (!city) {
    key = country;
  } else {
    let region = "";
    if (selector.regionCode) region = normalizePart(selector.regionCode).toUpperCase();
    else if (selector.regionName) region = normalizePart(selector.regionName);
    key = [country, region, city].filter((part) => part !== "").join("/");
  }

  if (!selector.languageCode) {
    return key;
  }

  const language = locationLanguage(country, selector.languageCode);
  const defaultLanguage = countrySeed(country)?.languageCode;
  return language.code === defaultLanguage ? key : `${key}@${language.code}`;
}

export function parseCanonicalKey(value: string): LocationSelector | null {
  const qualifiedParts = value.trim().split("@");
  if (qualifiedParts.length > 2 || !qualifiedParts[0]) {
    return null;
  }
  const [baseKey, rawLanguageCode] = qualifiedParts;
  const languageCode = rawLanguageCode ? resolveSerpLanguage(rawLanguageCode)?.code : undefined;
  if (rawLanguageCode !== undefined && !languageCode) {
    return null;
  }

  const parts = baseKey
    .split("/")
    .map((part) => normalizePart(part))
    .filter(Boolean);
  const [countryCode, middle, cityName] = parts;
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode) || parts.length > 3) {
    return null;
  }
  const language = languageCode ? { languageCode } : {};
  if (parts.length === 1) {
    return { countryCode, ...language };
  }
  if (parts.length === 2) {
    return { cityName: middle, countryCode, ...language };
  }
  if (!cityName) {
    return null;
  }
  return /^[A-Z]{2}-[A-Z0-9]+$/.test(middle)
    ? { cityName, countryCode, ...language, regionCode: middle }
    : { cityName, countryCode, ...language, regionName: middle };
}

export function normalizeCanonicalLocationKey(value: string): {
  canonicalKey: string;
  selector: LocationSelector;
} {
  const atCount = value.split("@").length - 1;
  if (atCount > 1) {
    throw new LocationInputError("languageCode", "A location key accepts one language qualifier.");
  }
  const rawLanguageCode = value.includes("@") ? value.slice(value.indexOf("@") + 1) : null;
  if (rawLanguageCode !== null && !resolveSerpLanguage(rawLanguageCode)) {
    throw new LocationInputError("languageCode", `Unsupported language: ${rawLanguageCode}`);
  }
  const selector = parseCanonicalKey(value);
  if (!selector) {
    throw new LocationInputError("canonicalKey", `Unsupported location key: ${value}`);
  }
  return { canonicalKey: canonicalKey(selector), selector };
}

// Carry code-based and name-based provider handles plus gl/hl so adapters never
// re-resolve locations in the runner hot path.
export type SerpRankLocation = {
  gl: string;
  hl: string;
  primaryGeoCode: number | null;
  primaryGeoName: string;
  secondaryGeoName: string;
};

/** Structural input accepts both resolved and Prisma location rows. */
export function serpRankLocation(
  location: Pick<
    ResolvedLocation,
    "gl" | "hl" | "primaryGeoCode" | "primaryGeoName" | "secondaryGeoName"
  >,
): SerpRankLocation {
  return {
    gl: location.gl,
    hl: location.hl,
    primaryGeoCode: location.primaryGeoCode,
    primaryGeoName: location.primaryGeoName,
    secondaryGeoName: location.secondaryGeoName,
  };
}

/** Country-level handles from a supported ISO alpha-2 seed (offline, deterministic). */
function countryRankLocation(seed: CountrySeed): SerpRankLocation {
  return {
    gl: seed.gl,
    hl: seed.hl,
    // Countries query by name on both providers; numeric codes only disambiguate cities.
    primaryGeoCode: null,
    primaryGeoName: seed.displayName,
    secondaryGeoName: seed.displayName,
  };
}

// This network-free hot-path fallback never throws; unknown legacy locations
// degrade to the default market.
export function serpRankLocationFromLegacy(value: string | null | undefined): SerpRankLocation {
  const countryCode = value ? countryCodeForMarketName(value) : null;
  const seed = (countryCode ? countrySeed(countryCode) : null) ?? defaultCountrySeed();
  return countryRankLocation(seed);
}

// Reconstruct country names from gl when degrading city handles; unknown gl values
// preserve existing names and never throw.
export function countryDegradedRankLocation(location: SerpRankLocation): SerpRankLocation {
  const seed = countrySeedForGl(location.gl);
  return {
    gl: location.gl,
    hl: location.hl,
    primaryGeoCode: null,
    primaryGeoName: seed?.displayName ?? location.primaryGeoName,
    secondaryGeoName: seed?.displayName ?? location.secondaryGeoName,
  };
}

function countrySeedForGl(gl: string): CountrySeed | null {
  return countrySeed(gl) ?? null;
}

function defaultCountrySeed(): CountrySeed {
  const code = countryCodeForMarketName(DEFAULT_SERP_MARKET);
  const seed = code ? countrySeed(code) : null;
  if (!seed) {
    // The default market is always in the seed table; this is an unreachable guard
    // kept only so the return type stays non-null without a non-null assertion.
    throw new Error("Default SERP market seed is missing.");
  }
  return seed;
}
