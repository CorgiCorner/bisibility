import { type SerpCountryCatalogEntry, serpCountryCatalog } from "./generated/serp-country-catalog";

// Lookups over the generated country catalog, the country half of the location catalog. This is
// the module a consumer imports when it needs countries and nothing else: it carries no market
// names as vocabulary, so it can outlive lib/serp/markets.ts.

export type SerpCountry = SerpCountryCatalogEntry;

const countryByCode = new Map(serpCountryCatalog.map((entry) => [entry.countryCode, entry]));

/** Alias matching ignores case, diacritics and punctuation: "Espana", "España" and "es" agree. */
export function normalizeCountryAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

const countryByAlias = new Map<string, SerpCountry>();
for (const entry of serpCountryCatalog) {
  for (const alias of [entry.displayName, entry.countryCode, ...entry.aliases]) {
    countryByAlias.set(normalizeCountryAlias(alias), entry);
  }
}

/** The catalog entry for an ISO alpha-2 code, in any case; null when the country is not supported. */
export function serpCountryByCode(countryCode: string): SerpCountry | null {
  return countryByCode.get(countryCode.trim().toUpperCase()) ?? null;
}

/** Resolves a country name, alias or ISO code to its catalog entry; null when nothing matches. */
export function serpCountryForName(value: string): SerpCountry | null {
  const alias = normalizeCountryAlias(value);
  return alias ? (countryByAlias.get(alias) ?? null) : null;
}

export { serpCountryCatalog };
