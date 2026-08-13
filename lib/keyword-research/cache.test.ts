import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keywordResearchCachedUntil, keywordResearchCacheKey } from "./cache";

vi.mock("server-only", () => ({}));

const spainCity = (cityName: string): SerpRankLocation => ({
  gl: "es",
  hl: "es",
  primaryGeoCode: 1234,
  primaryGeoName: `${cityName}, Spain`,
  secondaryGeoName: `${cityName}, Spain`,
});

const spainCountry: SerpRankLocation = {
  gl: "es",
  hl: "es",
  primaryGeoCode: null,
  primaryGeoName: "Spain",
  secondaryGeoName: "Spain",
};

const polandCountry: SerpRankLocation = {
  gl: "pl",
  hl: "pl",
  primaryGeoCode: null,
  primaryGeoName: "Poland",
  secondaryGeoName: "Poland",
};

const baseKeyInput = {
  connectionId: "conn_1",
  includeClickstream: false,
  normalizedSeed: "shoes",
  projectId: "proj_1",
  resultLimit: 100,
  source: "related" as const,
};

describe("keyword research cache expiry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the server-configured TTL and the earliest source fetch", () => {
    vi.stubEnv("KEYWORD_RESEARCH_CACHE_TTL_SECONDS", "1800");

    expect(
      keywordResearchCachedUntil(["2026-07-22T10:15:00.000Z", "2026-07-22T10:00:00.000Z"]),
    ).toBe("2026-07-22T10:30:00.000Z");
  });
});

describe("keywordResearchCacheKey", () => {
  it("produces identical keys for two cities in the same country and language", () => {
    const malaga = keywordResearchCacheKey({ ...baseKeyInput, location: spainCity("Malaga") });
    const madrid = keywordResearchCacheKey({ ...baseKeyInput, location: spainCity("Madrid") });
    expect(malaga).toBe(madrid);
  });

  it("distinguishes countries and languages", () => {
    const spainEs = keywordResearchCacheKey({ ...baseKeyInput, location: spainCountry });
    const polandPl = keywordResearchCacheKey({ ...baseKeyInput, location: polandCountry });
    const spainEn = keywordResearchCacheKey({
      ...baseKeyInput,
      location: { ...spainCountry, hl: "en" },
    });
    expect(spainEs).not.toBe(polandPl);
    expect(spainEs).not.toBe(spainEn);
  });

  it("prefixes every key with kr:v2:", () => {
    for (const location of [spainCity("Malaga"), spainCountry, polandCountry]) {
      const key = keywordResearchCacheKey({ ...baseKeyInput, location });
      expect(key.startsWith("kr:v2:")).toBe(true);
    }
  });
});
