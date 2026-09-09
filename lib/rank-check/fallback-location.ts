import type { Location } from "@/lib/generated/prisma/client";
import {
  countryDegradedRankLocation,
  type SerpRankLocation,
  serpRankLocation,
} from "@/lib/serp/location";

export type KeywordRankLocation = {
  handles: SerpRankLocation;
  granular: boolean;
};

export function keywordRankLocation(location: Location): KeywordRankLocation {
  if (!location) {
    throw new Error("Keyword location relation is required.");
  }
  const handles = serpRankLocation(location);
  if (
    !handles.gl.trim() ||
    !handles.hl.trim() ||
    !handles.primaryGeoName.trim() ||
    !handles.secondaryGeoName.trim() ||
    (handles.primaryGeoCode !== null &&
      (!Number.isInteger(handles.primaryGeoCode) || handles.primaryGeoCode < 0))
  ) {
    throw new Error("Keyword location relation contains invalid provider handles.");
  }
  return { granular: location.kind === "city", handles };
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
