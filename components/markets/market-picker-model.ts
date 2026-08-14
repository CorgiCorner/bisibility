import type { LocationFieldValue } from "@/components/keywords/location-picker-data";
import { canonicalKey } from "@/lib/serp/location";
import { supportsResearchMarket } from "@/lib/serp/market-capability";
import {
  resolveSerpMarket,
  serpMarketLanguages,
  suggestedSerpMarketLanguages,
} from "@/lib/serp/markets";

export type MarketPickerChoice = {
  canonicalKey: string;
  countryCode: string;
  displayName: string;
  kind: "country" | "region" | "city";
  language: { code: string; label: string };
  researchAvailable: boolean;
};

export function recommendedMarketLanguages(location: LocationFieldValue) {
  const fallback = resolveSerpMarket(location.countryCode).language;
  const suggested = suggestedSerpMarketLanguages(location.countryCode);
  return [fallback, ...suggested].filter(
    (language, index, all) => all.findIndex((item) => item.code === language.code) === index,
  );
}

export function additionalMarketLanguages(location: LocationFieldValue, query: string) {
  const suggested = new Set(recommendedMarketLanguages(location).map((language) => language.code));
  const term = query.trim().toLowerCase();
  return serpMarketLanguages(location.countryCode).filter(
    (language) =>
      !suggested.has(language.code) &&
      (!term || `${language.label} ${language.code}`.toLowerCase().includes(term)),
  );
}

export function marketChoice(
  location: LocationFieldValue,
  language: { code: string; label: string },
): MarketPickerChoice {
  return {
    canonicalKey: canonicalKey({
      cityName: location.cityName,
      countryCode: location.countryCode,
      languageCode: language.code,
      regionName: location.regionName,
    }),
    countryCode: location.countryCode,
    displayName: location.displayName,
    kind: location.kind,
    language,
    researchAvailable: supportsResearchMarket(location.countryCode, language.code),
  };
}
