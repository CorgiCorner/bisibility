import type { Location } from "@/lib/generated/prisma/client";
import {
  countryDegradedRankLocation,
  type SerpRankLocation,
  serpRankLocation,
  serpRankLocationFromLegacy,
} from "@/lib/serp/location";

export type KeywordRankLocation = {
  handles: SerpRankLocation;
  granular: boolean;
};

export function keywordRankLocation(
  location: Location | null | undefined,
  legacyLocation: string,
): KeywordRankLocation {
  if (!location) {
    return { granular: false, handles: serpRankLocationFromLegacy(legacyLocation) };
  }
  return { granular: location.kind === "city", handles: serpRankLocation(location) };
}

const PROVIDER_LACKS_CITY_HANDLE: Record<string, (handles: SerpRankLocation) => boolean> = {
  dataforseo: (handles) => handles.primaryGeoCode === null,
};

export function locationForProvider(
  providerId: string,
  handles: SerpRankLocation,
  granular: boolean,
): SerpRankLocation {
  if (!granular) return handles;
  return PROVIDER_LACKS_CITY_HANDLE[providerId]?.(handles)
    ? countryDegradedRankLocation(handles)
    : handles;
}
