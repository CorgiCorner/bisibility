import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { KeywordRow } from "@/lib/queries/keywords";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/constants";
import { serpCountryByCode } from "@/lib/serp/country-catalog";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";

const fallbackCountry = serpCountryByCode("US");
if (!fallbackCountry) throw new Error("The default country is missing from the country catalog.");

// biome-ignore format: compact fallback keeps client components under the line cap.
export const fallbackKeywordDefaults: ProjectDefaultMarket = { city: null, country: fallbackCountry.displayName, device: DEFAULT_SERP_DEVICE, displayName: fallbackCountry.displayName, locationKey: fallbackCountry.countryCode, source: "fallback" };

export function deriveDomain(rows: KeywordRow[]): string | undefined {
  const url = rows.find((row) => row.rankingUrl)?.rankingUrl;
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function defaultLocationSelection(
  market: ProjectDefaultMarket,
): LocationFieldValue | undefined {
  if (!market.city) {
    return undefined;
  }
  // biome-ignore format: compact location value keeps client components under the line cap.
  return { canonicalKey: market.locationKey, cityName: market.city, countryCode: market.locationKey.split("/")[0] ?? "", displayName: market.displayName, kind: "city", regionName: null };
}
