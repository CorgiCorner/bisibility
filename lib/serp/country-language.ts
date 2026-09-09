import { serpCountryByCode } from "./country-catalog";
import { cldrMarketLanguageSuggestions } from "./generated/cldr-market-language-suggestions";
import { serpLanguageCatalog } from "./generated/serp-language-catalog";
import { resolveSerpLanguage, type SerpLanguage } from "./language-catalog";

/** Language metadata is selected by ISO country code, never by a market label. */
export function defaultCountryLanguage(countryCode: string): SerpLanguage {
  const country = serpCountryByCode(countryCode);
  if (!country) throw new Error(`Unsupported country: ${countryCode}`);
  return { code: country.languageCode, label: country.languageLabel };
}

export function countryLanguages(countryCode: string): readonly SerpLanguage[] {
  const language = defaultCountryLanguage(countryCode);
  return [language, ...serpLanguageCatalog.filter((item) => item.code !== language.code)];
}

export function suggestedCountryLanguages(countryCode: string): readonly SerpLanguage[] {
  return (cldrMarketLanguageSuggestions[countryCode.toUpperCase()] ?? []).flatMap(
    (code) => resolveSerpLanguage(code) ?? [],
  );
}
