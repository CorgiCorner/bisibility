import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { relativePast } from "@/lib/format/relative-time";
import { appPath } from "@/lib/routing/app-path";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function savedKeywordIsStale(savedAt: string, now = new Date()) {
  return now.getTime() - new Date(savedAt).getTime() > STALE_AFTER_MS;
}

export function savedKeywordAge(savedAt: string, now = new Date()) {
  return relativePast(new Date(savedAt), now);
}

export function savedKeywordResearchHref(
  projectRef: string,
  row: Pick<SavedKeywordRow, "location" | "sourceSeed">,
) {
  const params = new URLSearchParams();
  if (row.sourceSeed) params.set("seed", row.sourceSeed);
  params.set("location", row.location);
  return `${appPath(projectRef, "keyword-research")}?${params.toString()}`;
}

export function savedKeywordLocation(location: string): LocationFieldValue | null {
  if (!location.includes("/")) return countryValueForCode(location);
  const [countryCode = "", regionName = null, cityName = null] = location.split("/");
  if (!countryCode || !cityName) return null;
  const country = countryValueForCode(countryCode);
  return {
    canonicalKey: location,
    cityName,
    countryCode,
    displayName: [cityName, regionName, country?.displayName ?? countryCode]
      .filter(Boolean)
      .join(", "),
    kind: "city",
    regionName,
  };
}

export function filterSavedKeywords(rows: readonly SavedKeywordRow[], search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return [...rows];
  return rows.filter((row) =>
    [row.text, row.sourceSeed, row.location, row.intent]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalized)),
  );
}
