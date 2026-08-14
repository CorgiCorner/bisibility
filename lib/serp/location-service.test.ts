import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveKeywordLocation } from "./location-service";

const mocks = vi.hoisted(() => ({
  createCityLocationLookup: vi.fn(),
  lookupConfigFromConnections: vi.fn(),
  prisma: {
    location: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConnection: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./location-lookup", () => ({
  createCityLocationLookup: mocks.createCityLocationLookup,
  lookupConfigFromConnections: mocks.lookupConfigFromConnections,
}));

// The real prismaLocationStore + resolveLocation run against the mocked prisma;
// only the provider HTTP layer (createCityLocationLookup) is faked, so no network.
function upsertEchoesCreate() {
  mocks.prisma.location.upsert.mockImplementation(({ create }) => ({
    ...create,
    id: `loc_${create.canonicalKey}`,
  }));
}

describe("resolveKeywordLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.lookupConfigFromConnections.mockReturnValue({});
    upsertEchoesCreate();
  });

  it("country-only resolves deterministically without any provider lookup", async () => {
    const result = await resolveKeywordLocation({ country: "United States", projectId: "p1" });

    expect(result.degraded).toBe(false);
    expect(result.warning).toBeNull();
    expect(result.location).toMatchObject({
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      kind: "country",
    });
    // No provider connections loaded, no lookup built for a country-only selector.
    expect(mocks.prisma.providerConnection.findMany).not.toHaveBeenCalled();
    expect(mocks.createCityLocationLookup).not.toHaveBeenCalled();
  });

  it("selection country resolves by ISO code without any provider lookup", async () => {
    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { countryCode: "PL", kind: "country" },
    });

    expect(result.location).toMatchObject({
      canonicalKey: "PL",
      countryCode: "PL",
      displayName: "Poland",
      kind: "country",
    });
    expect(mocks.prisma.providerConnection.findMany).not.toHaveBeenCalled();
  });

  it("selection canonicalKey uses the cached row without loading providers", async () => {
    mocks.prisma.location.findUnique.mockResolvedValueOnce({
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin,Texas,United States",
      gl: "us",
      hl: "en",
      id: "loc_existing",
      kind: "city",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoCode: 1026201,
      primaryGeoName: "Austin,Texas,United States",
      regionCode: null,
      secondaryGeoName: "Austin,Texas,United States",
    });

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });

    expect(result.degraded).toBe(false);
    expect(result.location.id).toBe("loc_existing");
    expect(mocks.prisma.providerConnection.findMany).not.toHaveBeenCalled();
    expect(mocks.createCityLocationLookup).not.toHaveBeenCalled();
  });

  it("normalizes a default-language key before the first database lookup", async () => {
    mocks.prisma.location.findUnique.mockResolvedValueOnce({
      canonicalKey: "ES",
      cityName: null,
      countryCode: "ES",
      displayName: "Spain",
      gl: "es",
      hl: "es",
      id: "loc_spain",
      kind: "country",
      languageCode: "es",
      languageLabel: "Spanish",
      primaryGeoCode: null,
      primaryGeoName: "Spain",
      regionCode: null,
      secondaryGeoName: "Spain",
    });

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "ES@es", kind: "city" },
    });

    expect(mocks.prisma.location.findUnique).toHaveBeenCalledWith({
      where: { canonicalKey: "ES" },
    });
    expect(result.location.id).toBe("loc_spain");
    expect(mocks.prisma.providerConnection.findMany).not.toHaveBeenCalled();
  });

  it.each(["ES@zz", "ES@en@fr", "ES@"])(
    "rejects invalid language qualifiers before database lookup: %s",
    async (canonicalKey) => {
      await expect(
        resolveKeywordLocation({
          projectId: "p1",
          selection: { canonicalKey, kind: "city" },
        }),
      ).rejects.toMatchObject({ field: "languageCode" });
      expect(mocks.prisma.location.findUnique).not.toHaveBeenCalled();
    },
  );

  it("city resolves through the configured provider and yields a city locationId", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { credentialsEncrypted: "enc", provider: "dataforseo" },
    ]);
    mocks.lookupConfigFromConnections.mockReturnValue({
      dataForSeo: { login: "l", password: "p" },
    });
    mocks.createCityLocationLookup.mockReturnValue({
      findCity: vi.fn().mockResolvedValue({
        cityName: "Austin",
        displayName: "Austin,Texas,United States",
        primaryGeoCode: 1026201,
        primaryGeoName: "Austin,Texas,United States",
        regionCode: null,
        regionName: "Texas",
        secondaryGeoName: "United States",
      }),
    });

    const result = await resolveKeywordLocation({
      city: "Austin",
      country: "United States",
      projectId: "p1",
    });

    expect(result.degraded).toBe(false);
    expect(result.location).toMatchObject({
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      kind: "city",
      primaryGeoCode: 1026201,
    });
    expect(result.location.id).toBe("loc_US/Texas/Austin");
  });

  it("missing selection canonicalKey is parsed and resolved as a fresh candidate", async () => {
    const findCity = vi.fn().mockResolvedValue({
      cityName: "Austin",
      displayName: "Austin,Texas,United States",
      primaryGeoCode: 1026201,
      primaryGeoName: "Austin,Texas,United States",
      regionCode: null,
      regionName: "Texas",
      secondaryGeoName: "Austin,Texas,United States",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { credentialsEncrypted: "enc", provider: "serpapi" },
    ]);
    mocks.lookupConfigFromConnections.mockReturnValue({ serpApi: true });
    mocks.createCityLocationLookup.mockReturnValue({ findCity });

    const result = await resolveKeywordLocation({
      projectId: "p1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });

    expect(findCity).toHaveBeenCalledWith({
      cityName: "Austin",
      countryCode: "US",
      regionCode: undefined,
      regionName: "Texas",
    });
    expect(result.location.canonicalKey).toBe("US/Texas/Austin");
  });

  it("unsupported city degrades to the country row with a warning (non-fatal)", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { credentialsEncrypted: "enc", provider: "serpapi" },
    ]);
    mocks.lookupConfigFromConnections.mockReturnValue({ serpApi: true });
    mocks.createCityLocationLookup.mockReturnValue({
      findCity: vi.fn().mockResolvedValue(null),
    });

    const result = await resolveKeywordLocation({
      city: "Nowheresville",
      country: "United States",
      projectId: "p1",
    });

    expect(result.degraded).toBe(true);
    expect(result.warning).toContain("Nowheresville");
    expect(result.location).toMatchObject({ canonicalKey: "US", kind: "country" });
  });

  it("throws on an unsupported country (create/edit-time, correctable)", async () => {
    await expect(resolveKeywordLocation({ country: "Atlantis", projectId: "p1" })).rejects.toThrow(
      /Unsupported country/,
    );
  });

  it("resolves a city offline when no provider is configured (degrades to country)", async () => {
    // No connections -> no lookup built -> city cannot resolve -> country fallback.
    const result = await resolveKeywordLocation({
      city: "Austin",
      country: "United States",
      projectId: "p1",
    });

    expect(result.degraded).toBe(true);
    expect(result.location).toMatchObject({ canonicalKey: "US", kind: "country" });
    expect(mocks.createCityLocationLookup).not.toHaveBeenCalled();
  });
});
