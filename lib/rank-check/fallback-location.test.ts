import type { SerpRankLocation } from "@/lib/serp/location";
import { describe, expect, it } from "vitest";
import { locationForProvider } from "./fallback-location";

const MADRID_ENGLISH: SerpRankLocation = {
  gl: "es",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "Madrid,Spain",
  secondaryGeoName: "Madrid, Spain",
};

describe("locationForProvider", () => {
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
