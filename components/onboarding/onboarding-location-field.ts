import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { allMarketLanguages } from "@/components/markets/market-picker-model";
import { type ProjectDefaultsInput, projectDefaultsSchema } from "@/lib/schemas/project";
import { parseCanonicalKey } from "@/lib/serp/location";

function cityDisplayName({
  cityName,
  countryName,
  region,
}: {
  cityName: string;
  countryName: string;
  region: string | null;
}) {
  return [cityName, region, countryName].filter(Boolean).join(", ");
}

function countryValueOrThrow(countryCode: string) {
  const country = countryValueForCode(countryCode);
  if (!country) {
    throw new Error(`Country ${countryCode} is missing from the location catalog.`);
  }
  return country;
}

function languageLabel(
  countryCode: string,
  languageCode: string | null | undefined,
  fallback: string,
) {
  if (!languageCode) return fallback;
  return (
    allMarketLanguages({ countryCode }).find((language) => language.code === languageCode)?.label ??
    languageCode
  );
}

export function locationValueForKey(key: string): LocationFieldValue {
  const country = countryValueForCode(key);
  if (country) {
    return country;
  }
  const selector = parseCanonicalKey(key);
  if (!selector) {
    throw new Error(`Unsupported onboarding location key: ${key}`);
  }
  const countryValue = countryValueOrThrow(selector.countryCode);
  if (!selector.cityName) {
    return {
      ...countryValue,
      canonicalKey: key,
      countryCode: selector.countryCode,
      languageCode: selector.languageCode ?? countryValue.languageCode,
      languageLabel: languageLabel(
        selector.countryCode,
        selector.languageCode,
        countryValue.languageLabel ?? countryValue.languageCode ?? selector.countryCode,
      ),
    };
  }
  const region = selector.regionName ?? selector.regionCode ?? null;
  return {
    canonicalKey: key,
    cityName: selector.cityName,
    countryCode: selector.countryCode,
    displayName: cityDisplayName({
      cityName: selector.cityName,
      countryName: countryValue.displayName,
      region,
    }),
    hl: countryValue.hl,
    kind: "city",
    languageCode: selector.languageCode ?? countryValue.languageCode,
    languageLabel: languageLabel(
      selector.countryCode,
      selector.languageCode,
      countryValue.languageLabel ?? countryValue.languageCode ?? selector.countryCode,
    ),
    regionName: region,
  };
}

export function locationValuesForKeys(keys: readonly string[]) {
  return keys.map(locationValueForKey);
}

/** Project defaults still serialize the country name for the legacy server input. */
export function countryNameForLocationValue(
  value: LocationFieldValue,
): ProjectDefaultsInput["country"] {
  const country = projectDefaultsSchema.shape.country.safeParse(
    countryValueOrThrow(value.countryCode).displayName,
  );
  if (!country.success) {
    throw new Error(`Country ${value.countryCode} cannot be stored in project defaults.`);
  }
  return country.data;
}

export function languageForLocationValue(value: LocationFieldValue) {
  return value.languageLabel ?? value.languageCode ?? value.countryCode;
}

export function displayLocationValues(values: readonly LocationFieldValue[]) {
  if (values.length <= 2) {
    return values.map((value) => value.displayName).join(", ");
  }
  return `${values[0]?.displayName ?? ""} +${values.length - 1}`;
}
