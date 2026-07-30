import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocationLookupCacheForTests,
  createCityLocationLookup,
  lookupConfigFromConnections,
  suggestLocations,
} from "./location-lookup";

const mocks = vi.hoisted(() => ({
  consumeProviderLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
}));

// Real credential resolution is exercised here (no HTTP): env fallback lets the
// DataForSEO Basic auth build without stored secrets, mirroring local dev.
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

// DataForSEO /serp/google/locations/{iso} envelope: numeric location_code +
// hierarchical location_name, typed by location_type.
function dataForSeoLocations() {
  return {
    tasks: [
      {
        result: [
          {
            country_iso_code: "US",
            location_code: 2840,
            location_name: "United States",
            location_type: "Country",
          },
          {
            country_iso_code: "US",
            location_code: 1026201,
            location_name: "Austin,Texas,United States",
            location_type: "City",
          },
          {
            country_iso_code: "US",
            location_code: 1234,
            location_name: "Austin County,Texas,United States",
            location_type: "County",
          },
        ],
      },
    ],
  };
}

function dataForSeoAmbiguousLocations() {
  return {
    tasks: [
      {
        result: [
          {
            country_iso_code: "US",
            location_code: 1026201,
            location_name: "Austin,Texas,United States",
            location_type: "City",
          },
          {
            country_iso_code: "US",
            location_code: 1026202,
            location_name: "Austin,Minnesota,United States",
            location_type: "City",
          },
        ],
      },
    ],
  };
}

// SerpAPI /locations.json array: canonical_name string, target_type, country_code, reach.
function serpApiLocations() {
  return [
    {
      canonical_name: "The University of Texas at Austin,Texas,United States",
      country_code: "US",
      name: "University of Texas",
      reach: 10,
      target_type: "University",
    },
    {
      canonical_name: "Austin,Texas,United States",
      country_code: "US",
      name: "Austin",
      reach: 4870000,
      target_type: "City",
    },
  ];
}

const DATAFORSEO_CREDS = { login: "byo-login", password: "byo-pass" };

describe("createCityLocationLookup", () => {
  beforeEach(() => {
    clearLocationLookupCacheForTests();
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "provider:test",
      cooling: false,
      remaining: 10,
      resetAt: Date.now() + 60_000,
      success: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("maps DataForSEO to primaryGeoCode + primaryGeoName (numeric code preferred)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(dataForSeoLocations()));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = createCityLocationLookup({ dataForSeo: DATAFORSEO_CREDS });
    const candidate = await lookup.findCity({ cityName: "Austin", countryCode: "US" });

    // Hits the country-scoped Locations path with Basic auth.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/locations/us");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("byo-login:byo-pass").toString("base64")}`,
    });
    expect(mocks.consumeProviderLimit).toHaveBeenCalledWith("dataforseo", DATAFORSEO_CREDS, {
      projectId: undefined,
    });
    // Code-based handles populated; name-based handle falls back to the country name.
    expect(candidate).toMatchObject({
      canonicalKey: "US/Texas/Austin",
      cityName: "Austin",
      primaryGeoCode: 1026201,
      primaryGeoName: "Austin,Texas,United States",
      regionName: "Texas",
      secondaryGeoName: "United States",
    });
  });

  it("maps SerpAPI to secondaryGeoName (canonical string, highest reach)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(serpApiLocations()));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = createCityLocationLookup({ serpApi: true });
    const candidate = await lookup.findCity({ cityName: "Austin", countryCode: "US" });

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://serpapi.com/locations.json?q=Austin",
    );
    // Name-based handle populated; code-based handles fall back to the country name/null.
    expect(candidate).toMatchObject({
      canonicalKey: "US/Texas/Austin",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionName: "Texas",
      secondaryGeoName: "Austin,Texas,United States",
    });
  });

  it("merges both providers when both are configured", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("dataforseo")
          ? jsonResponse(dataForSeoLocations())
          : jsonResponse(serpApiLocations()),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const lookup = createCityLocationLookup({ dataForSeo: DATAFORSEO_CREDS, serpApi: true });
    const candidate = await lookup.findCity({ cityName: "Austin", countryCode: "US" });

    expect(candidate).toMatchObject({
      canonicalKey: "US/Texas/Austin",
      primaryGeoCode: 1026201,
      primaryGeoName: "Austin,Texas,United States",
      regionName: "Texas",
      secondaryGeoName: "Austin,Texas,United States",
    });
  });

  it("suggests multiple same-named cities with region-label canonical keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(dataForSeoAmbiguousLocations()));
    vi.stubGlobal("fetch", fetchMock);

    const first = await suggestLocations(
      { countryCode: "US", query: "Austin" },
      { dataForSeo: DATAFORSEO_CREDS },
      { projectId: "p1" },
    );
    const second = await suggestLocations(
      { countryCode: "US", query: "Austin" },
      { dataForSeo: DATAFORSEO_CREDS },
      { projectId: "p1" },
    );

    expect(first.map((candidate) => candidate.canonicalKey)).toEqual([
      "US/Minnesota/Austin",
      "US/Texas/Austin",
    ]);
    expect(first.map((candidate) => candidate.regionName)).toEqual(["Minnesota", "Texas"]);
    expect(second).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.consumeProviderLimit).toHaveBeenCalledTimes(1);
  });

  it("returns null when no provider resolves the city (resolver degrades to country)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tasks: [{ result: [] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const lookup = createCityLocationLookup({ dataForSeo: DATAFORSEO_CREDS });
    expect(await lookup.findCity({ cityName: "Nowhere", countryCode: "US" })).toBeNull();
  });

  it("skips DataForSEO HTTP entirely when its creds are absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const lookup = createCityLocationLookup({ dataForSeo: {} });
    const candidate = await lookup.findCity({ cityName: "Austin", countryCode: "US" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(candidate).toBeNull();
  });
});

describe("lookupConfigFromConnections", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables DataForSEO from env creds and SerpAPI from connection presence", () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "env-login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "env-pass");

    const config = lookupConfigFromConnections([
      { credentialsEncrypted: null, provider: "dataforseo" },
      { credentialsEncrypted: null, provider: "serpapi" },
    ]);

    expect(config.dataForSeo).toMatchObject({ login: "env-login", password: "env-pass" });
    expect(config.serpApi).toBe(true);
  });

  it("omits DataForSEO when no usable creds resolve", () => {
    const config = lookupConfigFromConnections([
      { credentialsEncrypted: null, provider: "dataforseo" },
    ]);
    expect(config.dataForSeo).toBeUndefined();
  });
});
