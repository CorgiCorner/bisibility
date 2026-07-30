import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  countryNameForCode,
  countryValueForName,
} from "@/components/keywords/location-picker-data";
import type { AddKeywordInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_MARKET } from "@/lib/serp/markets";

export const pausedSchedule = {
  cronExpression: null,
  frequency: "paused",
  jitterMinutes: 60,
  timezone: "UTC",
} satisfies AddKeywordInput["schedule"];

function fallbackLocationValue() {
  const value = countryValueForName(DEFAULT_SERP_MARKET);
  if (!value) {
    throw new Error("Default SERP market is missing from the location catalog.");
  }
  return value;
}

export function initialLocationValue(
  defaultLocation: string,
  defaultSelection?: LocationFieldValue,
): LocationFieldValue {
  return defaultSelection ?? countryValueForName(defaultLocation) ?? fallbackLocationValue();
}

export function countryForSelection(value: LocationFieldValue) {
  return countryNameForCode(value.countryCode) ?? DEFAULT_SERP_MARKET;
}
