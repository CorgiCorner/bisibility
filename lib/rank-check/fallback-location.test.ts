import type { Location } from "@/lib/generated/prisma/client";
import type { SerpRankLocation } from "@/lib/serp/location";
import { describe, expect, it } from "vitest";
import { keywordRankLocation, locationForProvider } from "./fallback-location";

function location(overrides: Partial<Location> = {}): Location {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    createdAt: new Date("2026-01-01T06:00:00.000Z"),
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "location_us",
    kind: "country",
    languageCode: "en",
    languageLabel: "English",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    regionCode: null,
    secondaryGeoName: "United States",
    updatedAt: new Date("2026-01-01T06:00:00.000Z"),
    ...overrides,
  };
}

const MADRID_ENGLISH: SerpRankLocation = {
  gl: "es",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "Madrid,Spain",
  secondaryGeoName: "Madrid, Spain",
};

describe("locationForProvider", () => {
  it("projects country and city handles only from their loaded Location rows", () => {
    expect(keywordRankLocation(location()).handles).toEqual({
      gl: "us",
      hl: "en",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    });
    expect(
      keywordRankLocation(
        location({
          canonicalKey: "US/US-TX/Austin",
          cityName: "Austin",
          displayName: "Austin, Texas, United States",
          kind: "city",
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          regionCode: "US-TX",
          secondaryGeoName: "Austin, Texas, United States",
        }),
      ),
    ).toEqual({
      granular: true,
      handles: {
        gl: "us",
        hl: "en",
        primaryGeoCode: 1026339,
        primaryGeoName: "Austin,Texas,United States",
        secondaryGeoName: "Austin, Texas, United States",
      },
    });
  });

  it("rejects a missing relation instead of manufacturing a country handle", () => {
    const unsafeKeywordRankLocation = keywordRankLocation as unknown as (value: null) => unknown;

    expect(() => unsafeKeywordRankLocation(null)).toThrow("Keyword location relation is required.");
  });

  it("preserves a non-default language during DataForSEO city degradation", () => {
    expect(locationForProvider("dataforseo", MADRID_ENGLISH, true)).toEqual({
      gl: "es",
      hl: "en",
      primaryGeoCode: null,
      primaryGeoName: "Spain",
      secondaryGeoName: "Spain",
    });
  });
});
