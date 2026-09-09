import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveKeywordLocation, suggestKeywordLocations } from "./location-service";

const austin = {
  cityName: "Austin",
  countryCode: "US",
  displayName: "Austin,Texas,United States",
  kind: "city" as const,
  primaryGeoCode: 1_026_201,
  primaryGeoName: "Austin,Texas,United States",
  regionCode: null,
  regionName: "Texas",
  secondaryGeoName: "Austin, Texas, United States",
};

const mocks = vi.hoisted(() => ({
  findSharedLocationCandidateByCanonicalKey: vi.fn(),
  lookupFind: vi.fn(),
  prisma: { location: { findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() } },
  searchSharedLocations: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./common-location-catalog", () => ({
  createSharedLocationLookup: () => ({ find: mocks.lookupFind }),
  findSharedLocationCandidateByCanonicalKey: mocks.findSharedLocationCandidateByCanonicalKey,
  searchSharedLocations: mocks.searchSharedLocations,
}));

function upsertEchoesCreate() {
  mocks.prisma.location.upsert.mockImplementation(({ create }) => ({
    ...create,
    id: `loc_${create.canonicalKey}`,
  }));
}

describe("resolveKeywordLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSharedLocationCandidateByCanonicalKey.mockResolvedValue(null);
    mocks.lookupFind.mockResolvedValue(null);
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    mocks.prisma.location.updateMany.mockResolvedValue({ count: 0 });
    mocks.searchSharedLocations.mockResolvedValue([]);
    upsertEchoesCreate();
  });

  it("resolves a country without loading granular catalog data", async () => {
    const result = await resolveKeywordLocation({ country: "United States", projectId: "p1" });

    expect(result).toMatchObject({
      degraded: false,
      location: { canonicalKey: "US", countryCode: "US", kind: "country" },
    });
    expect(mocks.findSharedLocationCandidateByCanonicalKey).not.toHaveBeenCalled();
    expect(mocks.lookupFind).not.toHaveBeenCalled();
  });

  it("uses a trusted shared catalog candidate for an explicit city key", async () => {
    mocks.findSharedLocationCandidateByCanonicalKey.mockResolvedValue(austin);

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });

    expect(mocks.findSharedLocationCandidateByCanonicalKey).toHaveBeenCalledWith(
      "US/Texas/Austin",
      "city",
    );
    expect(mocks.lookupFind).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      degraded: false,
      location: { canonicalKey: "US/Texas/Austin", primaryGeoCode: 1_026_201 },
    });
  });

  it("preserves a selected non-default language while reading the unqualified catalog key", async () => {
    mocks.findSharedLocationCandidateByCanonicalKey.mockResolvedValue(austin);

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin@es", kind: "city" },
    });

    expect(mocks.findSharedLocationCandidateByCanonicalKey).toHaveBeenCalledWith(
      "US/Texas/Austin@es",
      "city",
    );
    expect(result.location).toMatchObject({
      canonicalKey: "US/Texas/Austin@es",
      languageCode: "es",
    });
  });

  it("enriches an exact cached catalog selection instead of trusting country fallback handles", async () => {
    const cached = {
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin,Texas,United States",
      gl: "us",
      hl: "en",
      id: "loc_existing",
      kind: "city" as const,
      languageCode: "en",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionCode: null,
      secondaryGeoName: "United States",
    };
    mocks.findSharedLocationCandidateByCanonicalKey.mockResolvedValue(austin);
    mocks.prisma.location.findUnique.mockResolvedValue(cached);

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });

    expect(result).toMatchObject({ degraded: false, location: { id: "loc_existing" } });
    expect(mocks.prisma.location.updateMany).toHaveBeenCalledWith({
      data: {
        primaryGeoCode: 1_026_201,
        primaryGeoName: "Austin,Texas,United States",
        secondaryGeoName: "Austin, Texas, United States",
      },
      where: {
        canonicalKey: "US/Texas/Austin",
        countryCode: "US",
        id: "loc_existing",
        kind: "city",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    });
  });

  it("keeps an unknown historical cached selection readable", async () => {
    mocks.prisma.location.findUnique.mockResolvedValueOnce({
      canonicalKey: "US/Legacy/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin,Legacy,United States",
      gl: "us",
      hl: "en",
      id: "loc_existing",
      kind: "city",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionCode: null,
      secondaryGeoName: "United States",
    });

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Legacy/Austin", kind: "city" },
    });

    expect(result.location.id).toBe("loc_existing");
    expect(mocks.lookupFind).not.toHaveBeenCalled();
  });

  it("does not bind an ambiguous legacy city name when shared lookup refuses it", async () => {
    const result = await resolveKeywordLocation({
      city: "Austin",
      country: "United States",
      projectId: "p1",
    });

    expect(result).toMatchObject({
      degraded: true,
      location: { canonicalKey: "US", kind: "country" },
    });
  });

  it("retries a historical two-part city sentinel as its exact region", async () => {
    const andalusia = {
      cityName: null,
      countryCode: "ES",
      displayName: "Andalusia,Spain",
      kind: "region" as const,
      primaryGeoCode: 21_160,
      primaryGeoName: "Andalusia,Spain",
      regionCode: null,
      regionName: "Andalusia",
      secondaryGeoName: "Andalusia, Spain",
    };
    mocks.lookupFind.mockImplementation((input) =>
      Promise.resolve(input.kind === "region" ? andalusia : null),
    );

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "ES/Andalusia", kind: "city" },
    });

    expect(mocks.lookupFind.mock.calls.map(([input]) => input.kind)).toEqual(["city", "region"]);
    expect(result).toMatchObject({
      degraded: false,
      location: { canonicalKey: "ES/Andalusia", kind: "region" },
    });
  });

  it("does not retry a failed three-part city key as a different region", async () => {
    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });

    expect(mocks.lookupFind).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      degraded: true,
      location: { canonicalKey: "US", kind: "country" },
    });
  });

  it("serves shared suggestions independently of project provider connections", async () => {
    mocks.searchSharedLocations.mockResolvedValue([{ ...austin, canonicalKey: "US/Texas/Austin" }]);

    await expect(
      suggestKeywordLocations({ countryCode: "US", projectId: null, query: "Austin" }),
    ).resolves.toEqual([expect.objectContaining({ canonicalKey: "US/Texas/Austin" })]);
    expect(mocks.searchSharedLocations).toHaveBeenCalledWith({
      countryCode: "US",
      limit: undefined,
      query: "Austin",
    });
  });
});
