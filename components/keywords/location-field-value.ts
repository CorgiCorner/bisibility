import type { KeywordLocation } from "@/lib/queries/keywords";
import { DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
import type { LocationFieldValue } from "./LocationField";
import {
  countryNameForCode,
  countryValueForCode,
  countryValueForName,
} from "./location-picker-data";

function regionNameFromDisplayName(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts.slice(1, -1).join(", ") : null;
}

export function locationFieldValueFromKeywordLocation(
  location: KeywordLocation,
  fallbackDisplayName = location.displayName,
): LocationFieldValue {
  if (location.kind === "city") {
    return {
      canonicalKey: location.canonicalKey,
      cityName: location.cityName,
      countryCode: location.countryCode,
      displayName: location.displayName,
      kind: "city",
      regionName: regionNameFromDisplayName(location.displayName),
    };
  }

  return (
    countryValueForCode(location.countryCode) ??
    countryValueForName(location.displayName) ?? {
      canonicalKey: location.canonicalKey,
      cityName: null,
      countryCode: location.countryCode,
      displayName: fallbackDisplayName,
      kind: "country",
      regionName: null,
    }
  );
}

export function countryForLocationFieldValue(value: LocationFieldValue) {
  return countryNameForCode(value.countryCode) ?? DEFAULT_SERP_MARKET;
}
