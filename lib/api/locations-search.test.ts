import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchLocations } from "./locations-search";

const mocks = vi.hoisted(() => ({
  prisma: { location: { findMany: vi.fn() } },
  suggestKeywordLocations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  suggestKeywordLocations: mocks.suggestKeywordLocations,
}));

function cachedRow(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "US/Texas/Austin",
    cityName: "Austin",
    countryCode: "US",
    displayName: "Austin,Texas,United States",
    hl: "en",
    id: "loc_1",
    kind: "city",
    languageCode: "en",
    languageLabel: "English",
    regionCode: null,
    ...overrides,
  };
}

describe("searchLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.location.findMany.mockResolvedValue([]);
    mocks.suggestKeywordLocations.mockResolvedValue([]);
  });

  it("returns cached city hits with no provider call", async () => {
    mocks.prisma.location.findMany.mockResolvedValue([cachedRow()]);

    const result = await searchLocations({ country: null, query: "Aust" });

    expect(mocks.prisma.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayName: "asc" }],
        where: expect.objectContaining({
          OR: [
            { displayName: { contains: "Aust", mode: "insensitive" } },
            { cityName: { contains: "Aust", mode: "insensitive" } },
          ],
          kind: "city",
        }),
      }),
    );
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonical_key: "US/Texas/Austin",
          city_name: "Austin",
          country_code: "US",
          display_name: "Austin,Texas,United States",
          id: "location:US/Texas/Austin",
          kind: "city",
          language_code: "en",
          language_label: "English",
          region_code: null,
          region_name: "Texas",
        }),
      ]),
    );
    expect(mocks.suggestKeywordLocations).not.toHaveBeenCalled();
  });

  it("filters cached city rows by ISO country from a legacy market name", async () => {
    await searchLocations({ country: "United States", query: "Berlin" });

    expect(mocks.prisma.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ countryCode: "US" }),
      }),
    );
  });

  it("adds catalog country matches independently of project membership", async () => {
    const result = await searchLocations({ country: null, query: "United" });

    expect(result.candidates.map((candidate) => candidate.canonical_key)).toEqual([
      "AE",
      "GB",
      "US",
    ]);
    expect(mocks.suggestKeywordLocations).not.toHaveBeenCalled();
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

  it("adds provider city suggestions when authorized, query is long enough, and cache is thin", async () => {
    mocks.suggestKeywordLocations.mockResolvedValue([
      {
        canonicalKey: "US/Texas/Dallas",
        cityName: "Dallas",
        countryCode: "US",
        displayName: "Dallas,Texas,United States",
        primaryGeoCode: 101,
        primaryGeoName: "Dallas,Texas,United States",
        regionCode: null,
        regionName: "Texas",
        secondaryGeoName: "Dallas,Texas,United States",
      },
    ]);

    const result = await searchLocations({
      country: "United States",
      projectId: "p1",
      query: "Dallas",
    });

    expect(mocks.suggestKeywordLocations).toHaveBeenCalledWith({
      countryCode: "US",
      limit: 10,
      projectId: "p1",
      query: "Dallas",
    });
    expect(result.candidates[0]).toMatchObject({
      canonical_key: "US/Texas/Dallas",
      city_name: "Dallas",
      region_name: "Texas",
    });
  });

  it("does not call providers without a project or for short queries", async () => {
    await searchLocations({ country: "United States", query: "Dallas" });
    await searchLocations({ country: "United States", projectId: "p1", query: "Da" });

    expect(mocks.suggestKeywordLocations).not.toHaveBeenCalled();
  });

  it("does not call providers when the cache already has three city hits", async () => {
    mocks.prisma.location.findMany.mockResolvedValue([
      cachedRow({ canonicalKey: "US/Texas/Austin", id: "loc_1" }),
      cachedRow({ canonicalKey: "US/Texas/Dallas", cityName: "Dallas", id: "loc_2" }),
      cachedRow({ canonicalKey: "US/Texas/Houston", cityName: "Houston", id: "loc_3" }),
    ]);

    await searchLocations({ country: "United States", projectId: "p1", query: "Texas" });

    expect(mocks.suggestKeywordLocations).not.toHaveBeenCalled();
  });

  it("falls back to global provider suggestions when the country filter is unsupported", async () => {
    await searchLocations({ country: "Atlantis", projectId: "p1", query: "Xyz" });

    expect(mocks.suggestKeywordLocations).toHaveBeenCalledWith({
      countryCode: null,
      limit: 10,
      projectId: "p1",
      query: "Xyz",
    });
  });
});
