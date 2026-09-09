import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchLocations } from "./locations-search";
import { locationSearchResponseSchema } from "./locations-search-contract";

const mocks = vi.hoisted(() => ({
  prisma: { membership: { findFirst: vi.fn() } },
  suggestKeywordLocations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  suggestKeywordLocations: mocks.suggestKeywordLocations,
}));

function sharedCandidate(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "US/Texas/Austin",
    cityName: "Austin",
    countryCode: "US",
    displayName: "Austin,Texas,United States",
    kind: "city" as const,
    primaryGeoCode: 1_026_201,
    primaryGeoName: "Austin,Texas,United States",
    regionCode: null,
    regionName: "Texas",
    secondaryGeoName: "Austin, Texas, United States",
    ...overrides,
  };
}

describe("searchLocations", () => {
  it("reads countries from the generated location catalog without cache suggestions", () => {
    const source = readFileSync(join(import.meta.dirname, "locations-search.ts"), "utf8");

    expect(source).toContain('from "@/lib/serp/country-catalog"');
    expect(source).not.toContain("@/lib/serp/markets");
    expect(source).not.toContain("prisma.location");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.suggestKeywordLocations.mockResolvedValue([]);
  });

  it("returns a shared city suggestion without a project, provider, or database cache", async () => {
    mocks.suggestKeywordLocations.mockResolvedValue([sharedCandidate()]);

    const result = await searchLocations({ country: "United States", query: "Austin" });

    expect(mocks.suggestKeywordLocations).toHaveBeenCalledWith({
      countryCode: "US",
      limit: 10,
      query: "Austin",
    });
    expect(mocks.prisma.membership.findFirst).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([
      expect.objectContaining({
        canonical_key: "US/Texas/Austin",
        city_name: "Austin",
        id: "location:US/Texas/Austin",
        kind: "city",
        region_name: "Texas",
      }),
    ]);
    expect(locationSearchResponseSchema.parse({ data: result.candidates }).data).toEqual(
      result.candidates,
    );
  });

  it("filters shared suggestions by ISO country from a legacy market name", async () => {
    await searchLocations({ country: "United States", query: "Berlin" });

    expect(mocks.suggestKeywordLocations).toHaveBeenCalledWith({
      countryCode: "US",
      limit: 10,
      query: "Berlin",
    });
  });

  it("keeps a shared region selectable", async () => {
    mocks.suggestKeywordLocations.mockResolvedValue([
      sharedCandidate({
        canonicalKey: "ES/Andalusia",
        cityName: null,
        countryCode: "ES",
        displayName: "Andalusia, Spain",
        kind: "region",
        primaryGeoCode: 21_160,
        primaryGeoName: "Andalusia,Spain",
        regionName: "Andalusia",
        secondaryGeoName: "Andalusia, Spain",
      }),
    ]);

    const result = await searchLocations({ country: "ES", query: "Andalusia" });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        canonical_key: "ES/Andalusia",
        city_name: null,
        kind: "region",
        region_name: "Andalusia",
      }),
    ]);
  });

  it("adds catalog country matches independently of project membership", async () => {
    const result = await searchLocations({ country: null, query: "United" });

    expect(result.candidates.map((candidate) => candidate.canonical_key)).toEqual([
      "AE",
      "GB",
      "US",
      "UM",
    ]);
  });

  it("assigns a stable id to catalog country matches", async () => {
    const result = await searchLocations({ country: null, query: "Spain" });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        canonical_key: "ES",
        id: "country:ES",
        kind: "country",
      }),
    ]);
  });

  it.each([
    ["CZ", "Czechia"],
    ["SK", "Slovakia"],
    ["HU", "Hungary"],
    ["RO", "Romania"],
    ["UA", "Ukraine"],
    ["GR", "Greece"],
    ["KR", "South Korea"],
    ["ID", "Indonesia"],
    ["AR", "Argentina"],
  ])("returns %s as an offline catalog country suggestion", async (countryCode, query) => {
    const result = await searchLocations({ country: null, query });

    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        canonical_key: countryCode,
        id: `country:${countryCode}`,
        kind: "country",
      }),
    );
  });

  it("scopes country and location candidates to a valid country filter", async () => {
    mocks.suggestKeywordLocations.mockResolvedValue([sharedCandidate()]);

    const result = await searchLocations({ country: "US", query: "Aus" });

    expect(result.candidates).toEqual([
      expect.objectContaining({ canonical_key: "US/Texas/Austin", country_code: "US" }),
    ]);
    expect(result.candidates).not.toContainEqual(expect.objectContaining({ country_code: "AU" }));
  });

  it("searches shared catalog entries for a short query without project access", async () => {
    await searchLocations({ country: "United States", query: "Au" });

    expect(mocks.suggestKeywordLocations).toHaveBeenCalledWith({
      countryCode: "US",
      limit: 10,
      query: "Au",
    });
  });

  it("returns no locations for an invalid ISO country filter", async () => {
    await expect(searchLocations({ country: "ZZ", query: "Madrid" })).resolves.toEqual({
      candidates: [],
      warning: null,
    });
    expect(mocks.suggestKeywordLocations).not.toHaveBeenCalled();
  });
});
