import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  countryNameForCode,
  countryValueForCode,
} from "@/components/keywords/location-picker-data";
import type { AddKeywordInput } from "@/lib/schemas/keyword";
import { countryCodeForMarketName, parseCanonicalKey } from "@/lib/serp/location";

export const DEFAULT_DRAWER_LOCATION_KEY = "US";

export const pausedSchedule = {
  cronExpression: null,
  frequency: "paused",
  jitterMinutes: 60,
  timezone: "UTC",
} satisfies AddKeywordInput["schedule"];

function fallbackLocationValue() {
  const value = countryValueForCode(DEFAULT_DRAWER_LOCATION_KEY);
  if (!value) {
    throw new Error("Default drawer location is missing from the location catalog.");
  }
  return value;
}

export function initialLocationValue(
  defaultLocationKey: string,
  defaultSelection?: LocationFieldValue,
): LocationFieldValue {
  if (defaultSelection) return defaultSelection;
  const countryCode =
    parseCanonicalKey(defaultLocationKey)?.countryCode ??
    countryCodeForMarketName(defaultLocationKey) ??
    defaultLocationKey;
  return countryValueForCode(countryCode) ?? fallbackLocationValue();
}

export function countryForSelection(value: LocationFieldValue) {
  const country = countryNameForCode(value.countryCode);
  if (!country) {
    throw new Error(`Country ${value.countryCode} is missing from the location catalog.`);
  }
  return country;
}
