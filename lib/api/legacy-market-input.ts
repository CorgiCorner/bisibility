import { serpCountryByCode, serpCountryForName } from "@/lib/serp/country-catalog";
import { resolveSerpLanguage } from "@/lib/serp/language-catalog";
import { canonicalKey, LocationInputError, type LocationSelection } from "@/lib/serp/location";
import { z } from "zod";

// The one temporary translator from legacy market NAMES on the wire to a Location
// reference (a canonical location key). Every handler resolves that key server-side
// through the location service, so a name is never trusted past this module. Nothing
// else under lib/api or lib/schemas may read the market catalog (market-catalog-guard);
// this module and its callers go away together at the sunset release below.

export const LEGACY_MARKET_INPUT_DEPRECATED_SINCE = "0.22.0";
export const LEGACY_MARKET_INPUT_SUNSET_VERSION = "0.24.0";
export const DEFAULT_LOCATION_KEY = "US";
export const LEGACY_DEFAULT_MARKET_NAME = "United States";
// Freeze legacy discovery order only at the compatibility boundary.
const legacyCountries = [
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "SE",
  "PL",
  "IE",
  "PT",
  "BE",
  "CH",
  "AT",
  "DK",
  "NO",
  "FI",
  "BR",
  "MX",
  "IN",
  "JP",
  "SG",
  "NZ",
  "ZA",
  "AE",
].map((code) => {
  const country = serpCountryByCode(code);
  if (!country) throw new Error(`Missing legacy country: ${code}`);
  return country;
});
const legacyNames = legacyCountries.map((country) => country.displayName);

export type LegacyMarketInput = {
  city?: string | null;
  country: string;
  language?: string | null;
};

export const legacyMarketNameSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? (serpCountryForName(value)?.displayName ?? value) : value,
  z.enum(legacyNames, { error: "Choose a supported SERP country." }),
);

// "/" and "@" are key separators; a legacy city carrying them still resolves as one city.
function cityKeyPart(city: string | null | undefined) {
  return (city ?? "").replace(/[/@]+/g, " ").replace(/\s+/g, " ").trim();
}

function legacyLocationParts(input: LegacyMarketInput) {
  const countryCode = serpCountryForName(input.country)?.countryCode;
  if (!countryCode) {
    throw new LocationInputError("canonicalKey", `Unsupported country: ${input.country}`);
  }
  const requested = input.language?.trim();
  const languageCode = requested ? resolveSerpLanguage(requested)?.code : undefined;
  if (requested && !languageCode) {
    throw new LocationInputError("languageCode", `Unsupported language: ${requested}`);
  }
  return { cityName: cityKeyPart(input.city), countryCode, languageCode };
}

/**
 * Translates legacy country names into a resolver selection. A legacy city remains
 * structured so a provider can supply its region before canonicalization. A canonical
 * city key is exact and must never be synthesized from the legacy city string.
 */
export function legacyMarketLocationSelection(input: LegacyMarketInput): LocationSelection {
  const { cityName, countryCode, languageCode } = legacyLocationParts(input);
  if (cityName) {
    return {
      cityName,
      countryCode,
      kind: "city",
      ...(languageCode ? { languageCode } : {}),
    };
  }
  return {
    canonicalKey: canonicalKey({ countryCode, languageCode }),
    kind: "city",
  };
}

/**
 * Produces a stable legacy compatibility key for country filters and deduplication.
 * Call `legacyMarketLocationSelection` to resolve a city, because this short city key
 * omits the provider-supplied region and is not an exact location reference.
 */
export function legacyMarketLocationKey(input: LegacyMarketInput): string {
  const { cityName, countryCode, languageCode } = legacyLocationParts(input);
  return canonicalKey({
    cityName: cityName || null,
    countryCode,
    kind: cityName ? "city" : "country",
    languageCode,
  });
}

/** Stored location labels a legacy country filter matches: the name, its aliases, and the raw value. */
export function legacyMarketFilterValues(value: string): string[] {
  const country = serpCountryForName(value);
  return country ? [...new Set([country.displayName, ...country.aliases, value])] : [value];
}

export function legacyMarketDeprecationNote() {
  return `Deprecated legacy market input: send location_key instead. Accepted until Bisibility ${LEGACY_MARKET_INPUT_SUNSET_VERSION}, then removed.`;
}

export function primaryLocationKeyDescription(detail: string) {
  return `Primary location reference: canonical country, region, or city key, optionally qualified with @language. ${detail}`;
}

export function deprecatedLegacyMarketField<T extends object>(description: string, schema: T) {
  return {
    ...schema,
    deprecated: true,
    description: `${description} ${legacyMarketDeprecationNote()}`,
  };
}

function marketNameValues() {
  return { enum: [...legacyNames], example: LEGACY_DEFAULT_MARKET_NAME, type: "string" };
}

/** Enumerated legacy market name without a deprecation, for formats that still carry names. */
export function legacyMarketNameValueSchema(description: string) {
  return { description, ...marketNameValues() };
}

export function legacyMarketNameOpenApiSchema(description: string) {
  return deprecatedLegacyMarketField(description, marketNameValues());
}

/** The legacy name catalog with the location key each name maps to, for discovery output. */
export function legacySerpMarketCatalog() {
  return {
    default_market: LEGACY_DEFAULT_MARKET_NAME,
    markets: legacyCountries.map((country) => ({
      gl: country.countryCode.toLowerCase(),
      language_code: country.languageCode,
      language_label: country.languageLabel,
      location_key: country.countryCode,
      name: country.displayName,
    })),
  };
}
