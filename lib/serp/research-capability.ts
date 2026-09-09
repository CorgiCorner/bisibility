import {
  labsCountryLocationCodes,
  labsMarketLanguageCatalog,
} from "./generated/labs-market-language-catalog";
import { countryDegradedRankLocation, type SerpRankLocation } from "./location";

export const RESEARCH_METRICS_UNAVAILABLE_TOOLTIP =
  "No search volume or difficulty data for this market - positions are tracked normally.";

/** The same sentence named per language, for surfaces where several pairs are in play and
    only some of them are off catalog. Keep it in step with the tooltip above. */
export function researchMetricsUnavailableNote(languageLabel: string) {
  return `${languageLabel}: no search volume or difficulty data for this market - positions are tracked normally.`;
}

const RESEARCH_LANGUAGE_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  NO: { no: "nb" },
};

export function researchProviderLanguageCode(countryCode: string, languageCode: string) {
  const country = countryCode.trim().toUpperCase();
  const language = languageCode.trim().toLowerCase();
  return RESEARCH_LANGUAGE_ALIASES[country]?.[language] ?? language;
}

export function supportsResearchScope(countryCode: string, languageCode: string) {
  const country = countryCode.trim().toUpperCase();
  const language = researchProviderLanguageCode(country, languageCode);
  return (
    researchCountryLocationCode(country) !== null &&
    (labsMarketLanguageCatalog[country]?.includes(language) ?? false)
  );
}

export function researchCountryLocationCode(countryCode: string) {
  return labsCountryLocationCodes[countryCode.trim().toUpperCase()] ?? null;
}

export function researchScopeForLocation(location: SerpRankLocation): SerpRankLocation {
  return countryDegradedRankLocation(location);
}

export function researchProviderLocation(input: {
  countryCode?: string;
  languageCode: string;
  locationCode: number;
}): SerpRankLocation {
  const languageCode = researchProviderLanguageCode(input.countryCode ?? "", input.languageCode);
  return {
    gl: input.countryCode?.trim().toLowerCase() ?? "",
    hl: languageCode,
    primaryGeoCode: input.locationCode,
    primaryGeoName: "",
    secondaryGeoName: "",
  };
}

export function researchProviderRankLocation(location: SerpRankLocation): SerpRankLocation {
  return {
    ...location,
    hl: researchProviderLanguageCode(location.gl, location.hl),
  };
}
