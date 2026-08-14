import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForCode } from "@/components/keywords/location-picker-data";
import type { RecentKeywordResearch } from "@/lib/keyword-research/recent-searches";
import { locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";

// Legacy entries lack locationKey and therefore fall back to the project-default market.
export function recentSearchLocation(
  search: Pick<RecentKeywordResearch, "locationKey" | "market">,
  projectDefault: LocationFieldValue,
): LocationFieldValue {
  const key = search.locationKey;
  if (!key || key === projectDefault.canonicalKey) return projectDefault;
  let market: ReturnType<typeof normalizeCanonicalLocationKey>;
  try {
    market = normalizeCanonicalLocationKey(key);
  } catch {
    return projectDefault;
  }
  if (market.canonicalKey === projectDefault.canonicalKey) return projectDefault;
  const { cityName = null, countryCode, languageCode } = market.selector;
  const country = countryValueForCode(countryCode);
  if (!country) return projectDefault;
  if (!cityName) {
    if (!languageCode) return country;
    const language = locationLanguage(countryCode, languageCode);
    return {
      ...country,
      canonicalKey: market.canonicalKey,
      displayName:
        search.market === key ? `${country.displayName} - ${language.label}` : search.market,
      hl: language.code,
      languageCode: language.code,
      languageLabel: language.label,
    };
  }
  const language = languageCode ? locationLanguage(countryCode, languageCode) : null;
  return {
    canonicalKey: market.canonicalKey,
    cityName,
    countryCode,
    displayName: search.market,
    ...(language
      ? { hl: language.code, languageCode: language.code, languageLabel: language.label }
      : {}),
    kind: "city",
  };
}
