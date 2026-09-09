import { RecentResearchSearches } from "@/components/research/RecentResearchSearches";
import { locationLanguage, normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchLocation } from "./context";
import { cacheTimeRemaining, parseRecentSearches } from "./recent-searches";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    location: { findMany: vi.fn() },
  },
  resolveLocation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveLocation,
}));

const referenceBase = process.env.R3_REFERENCE_BASE === "1";
const defaultModulePath = referenceBase ? "./default-market" : "./default-scope";
// R3 renamed default-market to default-scope, so this adapter selects the card-mandated entrypoint.
const defaultModule = await import(/* @vite-ignore */ defaultModulePath);

const inputs = {
  cityMobileWithKey: {
    defaults: {
      city: "Malaga",
      country: "Spain",
      device: "mobile",
      locationKey: "ES/ES-AN/Malaga",
      locationRef: null,
    },
    groups: [],
    locations: [],
  },
  countryDesktopWithoutKey: {
    defaults: {
      city: null,
      country: "Germany",
      device: "desktop",
      locationKey: null,
      locationRef: null,
    },
    groups: [],
    locations: [],
  },
  derivedCityMobile: {
    defaults: null,
    groups: [{ _count: { _all: 7 }, device: "mobile", locationId: "loc_malaga" }],
    locations: [
      {
        canonicalKey: "ES/ES-AN/Malaga",
        cityName: "Malaga",
        countryCode: "ES",
        displayName: "Malaga, Spain",
        gl: "es",
        hl: "es",
        id: "loc_malaga",
        kind: "city",
        languageLabel: "Spanish",
        primaryGeoCode: 1234,
        primaryGeoName: "Malaga, Spain",
        secondaryGeoName: "Malaga, Spain",
      },
    ],
  },
  derivedRegionDesktop: {
    defaults: null,
    groups: [{ _count: { _all: 6 }, device: "desktop", locationId: "loc_andalusia" }],
    locations: [
      {
        canonicalKey: "ES/ES-AN",
        cityName: null,
        countryCode: "ES",
        displayName: "Andalusia, Spain",
        hl: "es",
        id: "loc_andalusia",
        kind: "region",
        languageLabel: "Spanish",
      },
    ],
  },
  noDeviceFallsBack: {
    defaults: {
      city: null,
      country: "Germany",
      device: null,
      locationKey: "DE",
      locationRef: null,
    },
    groups: [],
    locations: [],
  },
  tiedDerivedDefaults: {
    defaults: null,
    groups: [
      { _count: { _all: 4 }, device: "desktop", locationId: "loc_de" },
      { _count: { _all: 4 }, device: "desktop", locationId: "loc_us" },
    ],
    locations: [
      {
        canonicalKey: "DE",
        cityName: null,
        countryCode: "DE",
        displayName: "Germany",
        hl: "de",
        id: "loc_de",
        kind: "country",
        languageLabel: "German",
      },
      {
        canonicalKey: "US",
        cityName: null,
        countryCode: "US",
        displayName: "United States",
        hl: "en",
        id: "loc_us",
        kind: "country",
        languageLabel: "English",
      },
    ],
  },
} as const;

function legacyScope(locationKey: string, device: string) {
  const location = normalizeCanonicalLocationKey(locationKey);
  return {
    countryCode: location.selector.countryCode,
    device,
    languageCode: locationLanguage(location.selector.countryCode, location.selector.languageCode)
      .code,
  };
}

async function observedDefault(input: (typeof inputs)[keyof typeof inputs]) {
  mocks.prisma.keyword.groupBy.mockResolvedValue(input.groups);
  mocks.prisma.location.findMany.mockResolvedValue(input.locations);
  const project = { defaults: input.defaults, id: "project_1" };

  if (referenceBase) {
    const legacy = defaultModule as {
      keywordResearchDefaultMarket: (value: unknown) => Promise<{
        market: { device: string; locationKey: string };
      }>;
    };
    const result = await legacy.keywordResearchDefaultMarket(project);
    return legacyScope(result.market.locationKey, result.market.device);
  }

  const current = defaultModule as {
    keywordResearchDefault: (value: unknown) => Promise<{
      device: string;
      scope: { countryCode: string; languageCode: string };
    }>;
  };
  const result = await current.keywordResearchDefault(project);
  return {
    countryCode: result.scope.countryCode,
    device: result.device,
    languageCode: result.scope.languageCode,
  };
}

describe("pre-R3 default behavior characterization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLocation.mockResolvedValue({
      location: {
        canonicalKey: "ES",
        gl: "es",
        hl: "es",
        primaryGeoCode: null,
        primaryGeoName: "Spain",
        secondaryGeoName: "Spain",
      },
    });
  });

  it("records location-key, country, city, region, device, and tie defaults", async () => {
    const observed: Record<string, unknown> = {};
    for (const [name, input] of Object.entries(inputs)) {
      observed[name] = await observedDefault(input);
    }

    expect(observed).toEqual({
      cityMobileWithKey: { countryCode: "ES", device: "mobile", languageCode: "es" },
      countryDesktopWithoutKey: { countryCode: "DE", device: "desktop", languageCode: "de" },
      derivedCityMobile: { countryCode: "ES", device: "mobile", languageCode: "es" },
      derivedRegionDesktop: { countryCode: "ES", device: "desktop", languageCode: "es" },
      noDeviceFallsBack: { countryCode: "US", device: "desktop", languageCode: "en" },
      tiedDerivedDefaults: { countryCode: "US", device: "desktop", languageCode: "en" },
    });
  });

  it("retains the derived city key for no-override cache reuse", async () => {
    const locationRef = inputs.derivedCityMobile.locations[0];
    mocks.prisma.keyword.groupBy.mockResolvedValue(inputs.derivedCityMobile.groups);
    mocks.prisma.location.findMany.mockResolvedValue(inputs.derivedCityMobile.locations);

    await expect(
      researchLocation({
        defaults: null,
        id: "project_1",
        keywords: [{ device: "mobile", location: "Malaga, Spain", locationRef }],
      } as never),
    ).resolves.toMatchObject({ key: "ES/ES-AN/Malaga", value: { gl: "es", hl: "es" } });

    expect(mocks.resolveLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["live", "2026-07-22T20:00:00.000Z", "cached, free for 10h"],
    ["expired", "2026-07-22T09:00:00.000Z", "cache expired"],
  ] as const)("keeps the %s legacy replay location key", (_state, cachedUntil, cacheLabel) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));
    const [search] = parseRecentSearches(
      JSON.stringify([
        {
          cachedUntil,
          connectionId: "conn_a00000000000000000000000",
          createdAt: "2026-07-22T08:00:00.000Z",
          includeClickstream: false,
          locationKey: "ES/ES-AN/Malaga",
          market: "Malaga, Spain",
          mode: "related",
          resultLimit: 100,
          seed: "standing desk",
        },
      ]),
    );
    if (!search) throw new Error("Expected the legacy replay to parse.");
    const display = (search as Record<string, unknown>)[referenceBase ? "market" : "scopeLabel"];

    expect(display).toBe(referenceBase ? "Malaga, Spain" : "Spain / Spanish");
    expect(search).toMatchObject({ locationKey: "ES/ES-AN/Malaga", mode: "related" });
    expect(cacheTimeRemaining(cachedUntil)).toBe(
      cacheLabel === "cache expired" ? 0 : 10 * 60 * 60 * 1000,
    );

    const onOpen = vi.fn();
    render(
      createElement(RecentResearchSearches, {
        onOpen,
        onRemove: vi.fn(),
        searches: [search] as never,
      }),
    );

    expect(screen.getByText(String(display), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(cacheLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^standing desk/i }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ locationKey: "ES/ES-AN/Malaga" }),
    );
  });
});
