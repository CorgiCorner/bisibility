import { appendFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), withCache: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  positiveTtl: (raw: string | undefined, fallback: number) => Number(raw) || fallback,
  readProviderLookupCache: mocks.read,
  withProviderLookupCache: mocks.withCache,
}));
vi.mock("@/lib/provider-lookups/paid-call", () => {
  class ProviderLookupSignal extends Error {
    constructor(readonly outcome: { costCents?: number; ok: false; reason: string }) {
      super(outcome.reason);
    }
  }
  return { ProviderLookupSignal };
});

type Module = Record<string, (...args: never[]) => unknown>;

const spanishScope = {
  countryCode: "ES",
  countryName: "Spain",
  languageCode: "es",
  languageLabel: "Spanish",
  providerLocationCode: 2724,
  researchAvailable: true,
};
const englishScope = {
  ...spanishScope,
  languageCode: "en",
  languageLabel: "English",
  researchAvailable: false,
};
const liveReplay = {
  hydrate: true,
  keywords: {
    cached: true,
    costCents: 0,
    data: { rows: ["live"] },
    fetchedAt: "2026-08-12T12:00:00.000Z",
    ok: true,
  },
  keywordsData: { rows: ["live"] },
  pages: { costCents: 0, ok: false, reason: "lookup_failed" },
  pagesData: null,
};

function asModule(value: unknown) {
  return value as Module;
}

function trace(value: unknown) {
  const json = JSON.stringify(value);
  const traceFile = process.env.DOMAIN_OVERVIEW_CHARACTERIZATION_TRACE_FILE;
  if (traceFile) appendFileSync(traceFile, `${json}\n`);
  return JSON.parse(json) as unknown;
}

function optionRecord(value: unknown) {
  const option = value as Record<string, unknown>;
  return {
    countryCode: option.countryCode,
    countryName: option.countryName ?? option.displayName,
    languageCode: option.languageCode,
    languageLabel: option.languageLabel,
    providerLocationCode: option.providerLocationCode ?? option.locationCode,
    researchAvailable: option.researchAvailable,
  };
}

async function optionModule() {
  // Card-mandated entrypoint adapter for market-options -> scope-options.
  const entrypoint = existsSync("lib/domain-overview/market-options.ts")
    ? "./market-options"
    : "./scope-options";
  return asModule(await import(/* @vite-ignore */ entrypoint));
}

describe("domain overview rename characterization foundations", () => {
  it.each([
    [
      "country, city, and region locations",
      [
        {
          cityName: null,
          countryCode: "ES",
          displayName: "Spain",
          kind: "country",
          languageCode: "es",
          languageLabel: "Spanish",
        },
        {
          cityName: "Malaga",
          countryCode: "ES",
          displayName: "Malaga, Andalusia, Spain",
          kind: "city",
          languageCode: "es",
          languageLabel: "Spanish",
        },
        {
          cityName: null,
          countryCode: "ES",
          displayName: "Andalusia, Spain",
          kind: "region",
          languageCode: "es",
          languageLabel: "Spanish",
        },
      ],
      [spanishScope],
    ],
    [
      "unsupported country language",
      [
        {
          cityName: null,
          countryCode: "ES",
          displayName: "Spain",
          kind: "country",
          languageCode: "en",
          languageLabel: "English",
        },
      ],
      [englishScope],
    ],
  ])("scope options preserve %s", async (_name, locations, expected) => {
    const options = await optionModule();
    const tracked = options.domainOverviewTrackedScopes ?? options.domainOverviewTrackedMarkets;
    const result = (tracked as (input: unknown) => unknown[])(locations).map(optionRecord);
    expect(trace(result)).toEqual(expected);
  });

  it("preserves supported and unavailable catalog membership", async () => {
    const options = await optionModule();
    const catalog = options.domainOverviewCatalogScopes ?? options.domainOverviewCatalogMarkets;
    const membership = { supported: false, unavailable: false };
    for (const value of (catalog as () => unknown[])()) {
      const scope = optionRecord(value);
      if (scope.countryCode !== "ES") continue;
      if (scope.languageCode === "es") membership.supported = true;
      if (scope.languageCode === "en") membership.unavailable = true;
    }
    expect(trace(membership)).toEqual({ supported: true, unavailable: false });
  });

  it.each([
    [
      "country location with a supplied key",
      { countryCode: "US", kind: "country", primaryGeoCode: 2840 },
      2840,
    ],
    [
      "country location without a key",
      { countryCode: "US", kind: "country", primaryGeoCode: null },
      2840,
    ],
    [
      "city location with a direct key",
      { countryCode: "US", kind: "city", primaryGeoCode: 1_026_201 },
      1_026_201,
    ],
    [
      "city location without a direct key",
      { countryCode: "US", kind: "city", primaryGeoCode: null },
      null,
    ],
    [
      "region location with a direct key",
      { countryCode: "US", kind: "region", primaryGeoCode: 2_116_842 },
      2_116_842,
    ],
  ])("target preserves %s", async (_name, location, expectedLocationCode) => {
    const target = asModule(await import("./target"));
    const locationCode = target.domainOverviewLocationCode as (input: unknown) => unknown;
    const normalize = (target.normalizeDomainOverviewResearchScope ??
      target.normalizeDomainOverviewMarket) as (input: unknown) => unknown;
    expect(
      trace({
        locationCode: locationCode(location),
        normalized: normalize({ languageCode: " EN ", locationCode: 2840 }),
      }),
    ).toEqual({
      locationCode: expectedLocationCode,
      normalized: { languageCode: "en", locationCode: 2840 },
    });
  });

  it.each([
    [
      "overview metrics cache key",
      {
        languageCode: "en",
        locationCode: 2840,
        module: "overview",
        projectId: "project_1",
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      },
      "do:v1:project_1:dataforseo:overview:example.com:root:2840:en",
    ],
    [
      "history replay cache key",
      {
        languageCode: "en",
        locationCode: 2840,
        module: "history",
        projectId: "project_1",
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      },
      "do:v1:project_1:dataforseo:history:example.com:root:2840:en",
    ],
    [
      "keywords lookup cache key",
      {
        languageCode: "es",
        limit: 100,
        locationCode: 2724,
        module: "keywords",
        offset: 200,
        projectId: "project_1",
        provider: "dataforseo",
        scope: "subdomain",
        target: "shop.example.com",
      },
      "do:v1:project_1:dataforseo:keywords:shop.example.com:subdomain:2724:es:100:200",
    ],
    [
      "pages lookup cache key",
      {
        languageCode: "es",
        limit: 50,
        locationCode: 2724,
        module: "pages",
        offset: 300,
        projectId: "project_1",
        provider: "dataforseo",
        scope: "subdomain",
        target: "shop.example.com",
      },
      "do:v1:project_1:dataforseo:pages:shop.example.com:subdomain:2724:es:50:300",
    ],
  ])("cache preserves the %s", async (_name, input, expectedKey) => {
    const cache = asModule(await import("./cache"));
    const key = (cache.domainOverviewCacheKey as (value: unknown) => unknown)(input);
    expect(trace({ key })).toEqual({ key: expectedKey });
  });

  it("preserves every report replay cache namespace", async () => {
    const cache = asModule(await import("./cache"));
    const reportKeys = (cache.domainOverviewReportCacheKeys as (value: unknown) => unknown)({
      keywordLimit: 100,
      languageCode: "es",
      locationCode: 2724,
      pageLimit: 50,
      projectId: "project_1",
      provider: "dataforseo",
      scope: "subdomain",
      target: "shop.example.com",
    });
    expect(trace(reportKeys)).toEqual({
      history: "do:v1:project_1:dataforseo:history:shop.example.com:subdomain:2724:es",
      keywords: "do:v1:project_1:dataforseo:keywords:shop.example.com:subdomain:2724:es:100:0",
      overview: "do:v1:project_1:dataforseo:overview:shop.example.com:subdomain:2724:es",
      pages: "do:v1:project_1:dataforseo:pages:shop.example.com:subdomain:2724:es:50:0",
    });
  });

  it("preserves replay hydration and provider error shapes", async () => {
    const cache = asModule(await import("./cache"));
    const durable = (cache.durableDomainOverviewModules as (value: unknown) => unknown)({
      fetchedAt: "2026-08-12T12:00:00.000Z",
      keywords: null,
      keywordsCached: {
        costCents: 3,
        data: { rows: ["live"] },
        fetchedAt: "2026-08-12T12:00:00.000Z",
      },
      pages: null,
      pagesCached: {
        costCents: 3,
        data: { rows: ["expired"] },
        fetchedAt: "2026-08-12T11:59:59.000Z",
      },
    });
    const lookup = (await import("@/lib/provider-lookups/paid-call")) as unknown as {
      ProviderLookupSignal: new (outcome: { ok: false; reason: string }) => Error;
    };
    const failure = cache.domainOverviewFailure as (error: unknown) => unknown;
    const errors = [
      failure(new lookup.ProviderLookupSignal({ ok: false, reason: "budget_exhausted" })),
      failure(new Error("offline")),
    ];
    expect(trace({ durable, errors })).toEqual({
      durable: liveReplay,
      errors: [
        { costCents: 0, ok: false, reason: "budget_exhausted" },
        { costCents: 0, ok: false, reason: "lookup_failed" },
      ],
    });
  });
});
