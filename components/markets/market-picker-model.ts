import type { LocationFieldValue } from "@/components/keywords/location-picker-data";
import {
  countryLanguages,
  defaultCountryLanguage,
  suggestedCountryLanguages,
} from "@/lib/serp/country-language";
import { canonicalKey, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { supportsResearchScope } from "@/lib/serp/research-capability";

export type MarketPickerChoice = {
  canonicalKey: string;
  countryCode: string;
  displayName: string;
  kind: "country" | "region" | "city";
  language: { code: string; label: string };
  researchAvailable: boolean;
};

type MarketLanguage = { code: string; label: string };
type CountryScope = Pick<LocationFieldValue, "countryCode">;

/** Both groups sort by label and by label only, so selecting a language never moves it. */
function byLabel(left: MarketLanguage, right: MarketLanguage) {
  return left.label.localeCompare(right.label, "en");
}

export function defaultMarketLanguage(location: CountryScope): MarketLanguage {
  return defaultCountryLanguage(location.countryCode);
}

export function recommendedMarketLanguages(location: CountryScope) {
  const fallback = defaultMarketLanguage(location);
  const suggested = suggestedCountryLanguages(location.countryCode);
  return [fallback, ...suggested]
    .filter(
      (language, index, all) => all.findIndex((item) => item.code === language.code) === index,
    )
    .sort(byLabel);
}

export function additionalMarketLanguages(location: CountryScope, query: string) {
  const suggested = new Set(recommendedMarketLanguages(location).map((language) => language.code));
  return filterMarketLanguages(
    countryLanguages(location.countryCode).filter((language) => !suggested.has(language.code)),
    query,
  ).sort(byLabel);
}

/** One filter rule for both groups: a search that hides a matching row in one group and
    keeps a non-matching row in the other would make the group labels lie. */
export function filterMarketLanguages(languages: readonly MarketLanguage[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return [...languages];
  return languages.filter((language) =>
    `${language.label} ${language.code}`.toLowerCase().includes(term),
  );
}

/** Every language the location can be tracked in, whatever the search currently shows.
    Selection lookups read this, so narrowing the search never drops a pending pick.
    The suggested group is unioned in rather than assumed to be inside the country's set:
    a rendered row that this cannot resolve would look selected and then vanish on commit,
    so containment is built here instead of being derived from two other functions. */
export function allMarketLanguages(location: CountryScope) {
  const catalog = countryLanguages(location.countryCode);
  const known = new Set(catalog.map((language) => language.code));
  return [
    ...catalog,
    ...recommendedMarketLanguages(location).filter((language) => !known.has(language.code)),
  ].sort(byLabel);
}

export function marketChoice(
  location: LocationFieldValue,
  language: { code: string; label: string },
): MarketPickerChoice {
  const { selector } = normalizeCanonicalLocationKey(location.canonicalKey, location.kind);
  return {
    canonicalKey: canonicalKey({
      ...selector,
      languageCode: language.code,
    }),
    countryCode: location.countryCode,
    displayName: location.displayName,
    kind: location.kind,
    language,
    researchAvailable: supportsResearchScope(location.countryCode, language.code),
  };
}
