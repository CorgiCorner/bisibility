import { serpCountryCatalog, serpCountryForName } from "./country-catalog";
import { resolveSerpLanguage, type SerpLanguage } from "./language-catalog";

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
  kind?: LocationKind;
  languageCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  selectedCanonicalKey?: string;
  cityName?: string | null;
};

export type LocationSelection =
  | {
      kind: "country";
      canonicalKey: string;
    }
  | {
      kind: "country";
      countryCode: string;
      languageCode?: string | null;
    }
  | { kind: "region"; canonicalKey: string }
  | { kind: "city"; canonicalKey: string }
  | {
      kind: "region";
      countryCode: string;
      languageCode?: string | null;
      regionCode?: string | null;
      regionName: string;
    }
  | {
      kind: "city";
      countryCode: string;
      languageCode?: string | null;
      regionName?: string | null;
      cityName: string;
    };

// A granular match returned by a provider location catalog. Its kind comes from
// the provider response and is verified against the selected canonical key.
export type LocationCandidate = {
  kind: "region" | "city";
  displayName: string;
  countryCode: string;
  regionCode: string | null;
  regionName?: string | null;
  cityName: string | null;
  primaryGeoCode: number | null;
  primaryGeoName: string;
  secondaryGeoName: string;
};

// Persistence boundary for cached location rows (backed by Prisma in M2+).
export interface LocationStore {
  findByKey(canonicalKey: string): Promise<ResolvedLocation | null>;
  // Implement with a canonicalKey upsert; the resolver re-reads after create races.
  create(row: Omit<ResolvedLocation, "id">): Promise<ResolvedLocation>;
  // Enrich a cached row only after the resolver verifies a trusted candidate has
  // the same canonical location identity. Optional for in-memory test stores.
  enrich?(location: ResolvedLocation, candidate: LocationCandidate): Promise<ResolvedLocation>;
}

// Provider-backed region/city search (implemented per adapter in M3+).
export interface LocationLookup {
  find(input: LocationSelector & { kind: "region" | "city" }): Promise<LocationCandidate | null>;
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
  serpCountryCatalog.map((country) => {
    const countryCode = country.countryCode;
    return [
      countryCode,
      {
        countryCode,
        displayName: country.displayName,
        gl: countryCode.toLowerCase(),
        hl: country.languageCode,
        languageCode: country.languageCode,
        languageLabel: country.languageLabel,
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
  return serpCountryForName(value)?.countryCode ?? null;
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

function selectorKind(selector: LocationSelector): LocationKind {
  if (selector.kind) return selector.kind;
  if (selector.cityName) return "city";
  if (selector.regionCode || selector.regionName) return "region";
  return "country";
}

/** Stable dedup key. Country: "US"; region: "US/Texas"; city: "US/Texas/Austin". */
export function canonicalKey(selector: LocationSelector): string {
  const country = selector.countryCode.trim().toUpperCase();
  const kind = selectorKind(selector);
  const region = selector.regionCode
    ? normalizePart(selector.regionCode).toUpperCase()
    : selector.regionName
      ? normalizePart(selector.regionName)
      : "";
  const city = selector.cityName ? normalizePart(selector.cityName) : "";
  const key =
    kind === "region" && region
      ? [country, region].join("/")
      : kind === "city" && city
        ? [country, region, city].filter(Boolean).join("/")
        : country;

  if (!selector.languageCode) {
    return key;
  }

  const language = locationLanguage(country, selector.languageCode);
  const defaultLanguage = countrySeed(country)?.languageCode;
  return language.code === defaultLanguage ? key : `${key}@${language.code}`;
}

export function parseCanonicalKey(
  value: string,
  expectedKind?: LocationKind,
): LocationSelector | null {
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
    if (expectedKind === "country") return null;
    return expectedKind === "region"
      ? /^[A-Z]{2}-[A-Z0-9]+$/.test(middle)
        ? { countryCode, kind: "region", regionCode: middle, ...language }
        : { countryCode, kind: "region", regionName: middle, ...language }
      : { cityName: middle, countryCode, ...language };
  }
  if (!cityName || expectedKind === "country" || expectedKind === "region") {
    return null;
  }
  return /^[A-Z]{2}-[A-Z0-9]+$/.test(middle)
    ? { cityName, countryCode, ...language, regionCode: middle }
    : { cityName, countryCode, ...language, regionName: middle };
}

export function normalizeCanonicalLocationKey(
  value: string,
  expectedKind?: LocationKind,
): {
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
  const selector = parseCanonicalKey(value, expectedKind);
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
