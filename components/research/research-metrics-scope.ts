import type { LocationFieldValue } from "@/components/keywords/LocationField";
import * as locationCatalog from "@/lib/serp/location";

export function metricsScope(location: LocationFieldValue, fallbackLanguage: string) {
  const seed = locationCatalog.countrySeed(location.countryCode);
  if (!seed) {
    return {
      country: "Unknown country",
      language: location.languageLabel ?? fallbackLanguage,
    };
  }
  const scope = locationCatalog.countryDegradedRankLocation({
    gl: seed.gl,
    hl: location.hl ?? seed.hl,
    primaryGeoCode: null,
    primaryGeoName: location.displayName,
    secondaryGeoName: location.displayName,
  });
  return {
    country: scope.primaryGeoName,
    language:
      location.languageLabel ?? (scope.hl === seed.hl ? seed.languageLabel : fallbackLanguage),
  };
}

export function hasMetricsScopeMismatch(location: LocationFieldValue) {
  const baseKey = location.canonicalKey.split("@", 1)[0] ?? "";
  return location.kind === "city" || Boolean(location.cityName) || baseKey.includes("/");
}
