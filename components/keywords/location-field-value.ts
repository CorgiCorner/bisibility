import type { KeywordLocation } from "@/lib/queries/keywords";
import { parseCanonicalKey } from "@/lib/serp/location";
import type { LocationFieldValue } from "./LocationField";
import { countryNameForCode } from "./location-picker-data";

export function locationFieldValueFromKeywordLocation(
  location: KeywordLocation,
  fallbackDisplayName = location.displayName,
): LocationFieldValue {
  const parsed = parseCanonicalKey(location.canonicalKey);
  return {
    canonicalKey: location.canonicalKey,
    cityName: location.kind === "city" ? location.cityName : null,
    countryCode: location.countryCode,
    displayName: location.displayName || fallbackDisplayName,
    kind: location.kind,
    languageCode: location.hl,
    languageLabel: location.languageLabel,
    regionName:
      location.kind === "region"
        ? (parsed?.regionName ?? parsed?.cityName ?? null)
        : (parsed?.regionName ?? null),
  };
}

export function countryForLocationFieldValue(value: LocationFieldValue) {
  return countryNameForCode(value.countryCode) ?? value.countryCode;
}
