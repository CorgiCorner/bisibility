import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  countryNameForCode,
  countryValueForCode,
} from "@/components/keywords/location-picker-data";
import { parseCanonicalKey } from "@/lib/serp/location";
import {
  DEFAULT_SERP_MARKET,
  languageForSerpMarket,
  normalizeSerpMarketName,
  type SerpMarketName,
} from "@/lib/serp/markets";
import { countryNameForLocationKey, DEFAULT_ONBOARDING_LOCATION_KEY } from "./onboarding-locations";

function defaultLocationValue() {
  const value = countryValueForCode(DEFAULT_ONBOARDING_LOCATION_KEY);
  if (!value) {
    throw new Error("Default onboarding location is missing from the location catalog.");
  }
  return value;
}

function cityDisplayName({
  cityName,
  countryCode,
  region,
}: {
  cityName: string;
  countryCode: string;
  region: string | null;
}) {
  const country = countryNameForCode(countryCode) ?? countryCode;
  return [cityName, region, country].filter(Boolean).join(", ");
}

export function locationValueForKey(key: string): LocationFieldValue {
  const country = countryValueForCode(key);
  if (country) {
    return country;
  }
  const selector = parseCanonicalKey(key);
  if (!selector?.cityName) {
    return defaultLocationValue();
  }
  const countryValue = countryValueForCode(selector.countryCode);
  const region = selector.regionName ?? selector.regionCode ?? null;
  return {
    canonicalKey: key,
    cityName: selector.cityName,
    countryCode: selector.countryCode,
    displayName: cityDisplayName({
      cityName: selector.cityName,
      countryCode: selector.countryCode,
      region,
    }),
    hl: countryValue?.hl,
    kind: "city",
    languageLabel: countryValue?.languageLabel,
    regionName: region,
  };
}

export function locationValuesForKeys(keys: readonly string[]) {
  return keys.map(locationValueForKey);
}

export function countryNameForLocationValue(value: LocationFieldValue): SerpMarketName {
  const fromCode = normalizeSerpMarketName(countryNameForCode(value.countryCode));
  return fromCode ?? countryNameForLocationKey(value.canonicalKey) ?? DEFAULT_SERP_MARKET;
}

export function languageForLocationValue(value: LocationFieldValue) {
  return value.languageLabel ?? languageForSerpMarket(countryNameForLocationValue(value));
}

export function displayLocationValues(values: readonly LocationFieldValue[]) {
  if (values.length <= 2) {
    return values.map((value) => value.displayName).join(", ");
  }
  return `${values[0]?.displayName ?? DEFAULT_SERP_MARKET} +${values.length - 1}`;
}
