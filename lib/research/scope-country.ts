import { type ResearchScope, researchScopeForLocation } from "@/lib/research/scope";
import { serpCountryByCode, serpCountryCatalog } from "@/lib/serp/country-catalog";
import { countryLanguages } from "@/lib/serp/country-language";

// Research is bought per country: the provider's keyword and domain catalogs are country level,
// and a country's language only decides which catalog row is read. The pickers therefore offer
// countries, and the language is resolved here rather than asked for.

function byCountryName(left: ResearchScope, right: ResearchScope) {
  return left.countryName.localeCompare(right.countryName, "en");
}

/**
 * The scope a country is researched in: its default language when the provider supports it,
 * otherwise the first supported language, so a country is never hidden by its default.
 */
export function researchScopeForCountry(countryCode: string): ResearchScope | null {
  const code = countryCode.trim().toUpperCase();
  if (!serpCountryByCode(code)) return null;
  let fallback: ResearchScope | null = null;
  for (const language of countryLanguages(code)) {
    const scope = researchScopeForLocation({
      countryCode: code,
      languageCode: language.code,
      languageLabel: language.label,
    });
    if (scope.researchAvailable) return scope;
    fallback ??= scope;
  }
  return fallback;
}

let catalogCache: readonly ResearchScope[] | null = null;

/** Every researchable country, one scope each, alphabetical. Computed once: the catalog is static. */
export function researchCountryScopes(): readonly ResearchScope[] {
  catalogCache ??= serpCountryCatalog
    .flatMap((country) => {
      const scope = researchScopeForCountry(country.countryCode);
      return scope?.researchAvailable ? [scope] : [];
    })
    .sort(byCountryName);
  return catalogCache;
}

/**
 * One scope per country, alphabetical. A country present in several languages keeps the first
 * scope given: the picker names the country, and the caller orders its input so that the first
 * entry is the language the country should be researched in.
 */
export function countryScopes(scopes: readonly ResearchScope[]): readonly ResearchScope[] {
  const byCountry = new Map<string, ResearchScope>();
  for (const scope of scopes) {
    if (!byCountry.has(scope.countryCode)) byCountry.set(scope.countryCode, scope);
  }
  return [...byCountry.values()].sort(byCountryName);
}

/** The scope to switch to for a country: the tracked one when the project has it, else the catalog's. */
export function resolveCountryScope(
  countryCode: string,
  tracked: readonly ResearchScope[],
): ResearchScope | null {
  const code = countryCode.trim().toUpperCase();
  return tracked.find((scope) => scope.countryCode === code) ?? researchScopeForCountry(code);
}
