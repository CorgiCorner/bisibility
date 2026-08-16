import { labsMarketLanguageCatalog } from "./generated/labs-market-language-catalog";
import { countryDegradedRankLocation, type SerpRankLocation } from "./location";

export const RESEARCH_METRICS_UNAVAILABLE_TOOLTIP =
  "No search volume or difficulty data for this market - positions are tracked normally.";

/** The same sentence named per language, for surfaces where several pairs are in play and
    only some of them are off catalog. Keep it in step with the tooltip above. */
export function researchMetricsUnavailableNote(languageLabel: string) {
  return `${languageLabel}: no search volume or difficulty data for this market - positions are tracked normally.`;
}

const RESEARCH_COUNTRY_LOCATION_CODES: Readonly<Record<string, number>> = {
  AE: 2784,
  AT: 2040,
  AU: 2036,
  BE: 2056,
  BR: 2076,
  CA: 2124,
  CH: 2756,
  DE: 2276,
  DK: 2208,
  ES: 2724,
  FI: 2246,
  FR: 2250,
  GB: 2826,
  IE: 2372,
  IN: 2356,
  IT: 2380,
  JP: 2392,
  MX: 2484,
  NL: 2528,
  NO: 2578,
  NZ: 2554,
  PL: 2616,
  PT: 2620,
  SE: 2752,
  SG: 2702,
  US: 2840,
  ZA: 2710,
};

const RESEARCH_LANGUAGE_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  NO: { no: "nb" },
};

export function researchProviderLanguageCode(countryCode: string, languageCode: string) {
  const country = countryCode.trim().toUpperCase();
  const language = languageCode.trim().toLowerCase();
  return RESEARCH_LANGUAGE_ALIASES[country]?.[language] ?? language;
}

export function supportsResearchMarket(countryCode: string, languageCode: string) {
  const country = countryCode.trim().toUpperCase();
  const language = researchProviderLanguageCode(country, languageCode);
  return labsMarketLanguageCatalog[country]?.includes(language) ?? false;
}

export function researchCountryLocationCode(countryCode: string) {
  return RESEARCH_COUNTRY_LOCATION_CODES[countryCode.trim().toUpperCase()] ?? null;
}

export function countryDegradedResearchLocation(location: SerpRankLocation): SerpRankLocation {
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
