import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { KeywordResearchRow } from "@/lib/keyword-research/types";
import { locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { supportsResearchMarket } from "@/lib/serp/market-capability";

export function researchMetricsAvailable(location: LocationFieldValue) {
  const normalized = normalizeCanonicalLocationKey(location.canonicalKey);
  const countryCode = normalized.selector.countryCode;
  const languageCode =
    normalized.selector.languageCode ??
    location.languageCode ??
    location.hl ??
    locationLanguage(countryCode).code;
  return supportsResearchMarket(countryCode, languageCode);
}

export function rowsForResearchMarket(
  rows: readonly KeywordResearchRow[],
  metricsAvailable: boolean,
): KeywordResearchRow[] {
  if (metricsAvailable) return [...rows];
  return rows.map((row) => ({
    ...row,
    competition: null,
    cpcCents: null,
    difficulty: null,
    monthlyTrend: [],
    searchVolume: null,
  }));
}
