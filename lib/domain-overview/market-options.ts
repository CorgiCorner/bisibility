import { canonicalKey, countrySeed } from "@/lib/serp/location";
import {
  countryDegradedResearchLocation,
  researchCountryLocationCode,
  supportsResearchMarket,
} from "@/lib/serp/market-capability";
import { serpMarkets } from "@/lib/serp/markets";

export const DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP =
  "Not available for domain analysis - this country-language pair is outside the research catalog.";

export type DomainOverviewMarketOption = {
  canonicalKey: string;
  cityName: null;
  countryCode: string;
  displayName: string;
  kind: "country";
  languageCode: string;
  languageLabel: string;
  locationCode: number | null;
  provenance: string | null;
  regionName: null;
  researchAvailable: boolean;
};

type TrackedLocation = {
  cityName: string | null;
  countryCode: string;
  displayName: string;
  kind: "country" | "region" | "city";
  languageCode: string;
  languageLabel: string;
  primaryGeoCode?: number | null;
};

export function domainOverviewCountryMarket(input: {
  countryCode: string;
  displayName?: string;
  languageCode: string;
  languageLabel: string;
  primaryGeoCode?: number | null;
}): DomainOverviewMarketOption {
  const requestedCountry = input.countryCode.trim().toUpperCase();
  const requestedName =
    input.displayName ?? countrySeed(requestedCountry)?.displayName ?? requestedCountry;
  const translated = countryDegradedResearchLocation({
    gl: requestedCountry.toLowerCase(),
    hl: input.languageCode,
    primaryGeoCode: input.primaryGeoCode ?? null,
    primaryGeoName: requestedName,
    secondaryGeoName: requestedName,
  });
  const countryCode = translated.gl.toUpperCase();
  const researchAvailable = supportsResearchMarket(countryCode, translated.hl);
  return {
    canonicalKey: canonicalKey({ countryCode, languageCode: translated.hl }),
    cityName: null,
    countryCode,
    displayName: countrySeed(countryCode)?.displayName ?? countryCode,
    kind: "country",
    languageCode: translated.hl,
    languageLabel: input.languageLabel,
    locationCode: researchCountryLocationCode(countryCode),
    provenance: null,
    regionName: null,
    researchAvailable,
  };
}

export function domainOverviewCatalogMarkets(): DomainOverviewMarketOption[] {
  return serpMarkets.flatMap((market) =>
    market.languages.flatMap((language) => {
      const option = domainOverviewCountryMarket({
        countryCode: market.google.gl,
        languageCode: language.code,
        languageLabel: language.label,
      });
      return option.researchAvailable ? [option] : [];
    }),
  );
}

export function domainOverviewTrackedMarkets(
  locations: readonly TrackedLocation[],
): DomainOverviewMarketOption[] {
  const byKey = new Map<string, DomainOverviewMarketOption & { provenancePlaces: string[] }>();
  for (const location of locations) {
    const option = domainOverviewCountryMarket(location);
    const place = location.kind === "country" ? null : (location.cityName ?? location.displayName);
    const existing = byKey.get(option.canonicalKey);
    if (existing) {
      if (place && !existing.provenancePlaces.includes(place))
        existing.provenancePlaces.push(place);
      continue;
    }
    byKey.set(option.canonicalKey, {
      ...option,
      provenancePlaces: place ? [place] : [],
    });
  }
  return [...byKey.values()].map(({ provenancePlaces, ...option }) => ({
    ...option,
    provenance:
      provenancePlaces.length > 0
        ? `${provenancePlaces.join(", ")} tracked at city level - domain analysis runs on the country pair.`
        : null,
  }));
}
