import { beforeEach, describe, expect, it, vi } from "vitest";
import { keywordMetricsCacheKey, keywordResearchCacheKey } from "./cache";
import { fetchKeywordMetrics } from "./metrics";
import { annotateResearchResult } from "./result-annotation";
import { researchKeywords } from "./service";
import { callResearchSource } from "./source-call";

const metricsHash = "2a9c7c9c1f993f6d67857b74d1644374042c14267e53d1dcbc9ff4cbba8279aa";
const connectionPublicId = "conn_a00000000000000000000000";
const referenceBase = process.env.R3_REFERENCE_BASE === "1";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  location: vi.fn(),
  metrics: vi.fn(),
  paid: vi.fn(),
  project: vi.fn(),
  read: vi.fn(),
  related: vi.fn(),
  release: vi.fn(),
  resetAt: vi.fn(),
  wait: vi.fn(),
  withCache: vi.fn(),
  write: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  acquireProviderLookupLock: mocks.acquire,
  positiveTtl: (_value: unknown, fallback: number) => fallback,
  providerLookupCacheConfigured: () => true,
  providerLookupContentionResetAt: mocks.resetAt,
  readProviderLookupCache: mocks.read,
  releaseProviderLookupLock: mocks.release,
  waitForProviderLookupCache: mocks.wait,
  withProviderLookupCache: mocks.withCache,
  writeProviderLookupCache: mocks.write,
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: () => Promise.resolve({ entries: [], manualAmountCents: null }),
}));
vi.mock("./context", () => ({
  connectionResources: () => [
    { id: connectionPublicId, label: "DataForSEO", provider: "dataforseo" },
  ],
  eligibleResearchConnections: (project: { eligible: unknown[] }) => project.eligible,
  keywordResearchProject: mocks.project,
  normalizeResearchKeyword: (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase(),
  researchLocation: mocks.location,
}));
vi.mock("./paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paid-call")>()),
  paidProviderCall: mocks.paid,
}));

const countryLocation = {
  gl: "es",
  hl: "es",
  primaryGeoCode: null,
  primaryGeoName: "Spain",
  secondaryGeoName: "Spain",
};
const cityLocation = {
  gl: "es",
  hl: "es",
  primaryGeoCode: 1234,
  primaryGeoName: "Malaga, Spain",
  secondaryGeoName: "Malaga, Spain",
};
const regionLocation = {
  gl: "es",
  hl: "es",
  primaryGeoCode: 5678,
  primaryGeoName: "Andalusia, Spain",
  secondaryGeoName: "Andalusia, Spain",
};
const connection = {
  credentialsEncrypted: "secret",
  id: "connection_1",
  provider: "dataforseo",
  publicId: connectionPublicId,
};
const provider = {
  fetchKeywordMetrics: mocks.metrics,
  fetchRelatedKeywords: mocks.related,
  id: "dataforseo",
  label: "DataForSEO",
};
const selection = { connection, provider };
const project = {
  eligible: [selection],
  id: "project_1",
  keywords: [{ locationRef: { canonicalKey: "ES/ES-AN/Malaga" }, text: "standing desk" }],
  savedKeywords: [
    {
      countryCode: "ES",
      languageCode: "es",
      location: "ES/ES-AN/Malaga",
      normalizedText: "standing desk",
    },
  ],
};
const cachedMetrics = {
  competition: null,
  cpcCents: null,
  difficulty: null,
  fetchedAt: "2026-07-22T08:00:00.000Z",
  intent: null,
  keyword: "Standing Desk",
  monthlyTrend: [],
  searchVolume: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquire.mockResolvedValue({ key: "lock", token: "token" });
  mocks.location.mockResolvedValue({ key: "ES/ES-AN/Malaga", value: cityLocation });
  mocks.metrics.mockResolvedValue({ costCents: 1, rows: [] });
  mocks.paid.mockImplementation(({ call }: { call: (credentials: object) => Promise<unknown> }) =>
    call({}),
  );
  mocks.project.mockResolvedValue(project);
  mocks.read.mockResolvedValue(null);
  mocks.related.mockResolvedValue({ costCents: 1, rows: [] });
  mocks.release.mockResolvedValue(undefined);
  mocks.resetAt.mockResolvedValue(1);
  mocks.wait.mockResolvedValue(null);
  mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
    cached: false,
    status: "success",
    value: await load(),
  }));
  mocks.write.mockResolvedValue(true);
});

describe("pre-R3 cache behavior characterization", () => {
  it("asserts literal lookup and metrics keys for country, city, and region inputs", () => {
    const lookupInput = {
      connectionId: "connection_1",
      includeClickstream: false,
      normalizedSeed: "standing desk",
      projectId: "project_1",
      resultLimit: 100,
      source: "related" as const,
    };

    expect(keywordResearchCacheKey({ ...lookupInput, location: countryLocation })).toBe(
      "kr:v2:project_1:connection_1:standing desk:Spain:es:related:100:0",
    );
    expect(keywordResearchCacheKey({ ...lookupInput, location: cityLocation })).toBe(
      "kr:v2:project_1:connection_1:standing desk:Spain:es:related:100:0",
    );
    expect(keywordResearchCacheKey({ ...lookupInput, location: regionLocation })).toBe(
      "kr:v2:project_1:connection_1:standing desk:Spain:es:related:100:0",
    );
    expect(
      keywordMetricsCacheKey({
        connectionId: "connection_1",
        includeClickstream: false,
        keyword: "standing desk",
        locationKey: "ES",
        projectId: "project_1",
      }),
    ).toBe(`km:v1:project_1:connection_1:ES:0:${metricsHash}`);
    expect(
      keywordMetricsCacheKey({
        connectionId: "connection_1",
        includeClickstream: false,
        keyword: "standing desk",
        locationKey: "ES/ES-AN/Malaga",
        projectId: "project_1",
      }),
    ).toBe(`km:v1:project_1:connection_1:ES/ES-AN/Malaga:0:${metricsHash}`);
    expect(
      keywordMetricsCacheKey({
        connectionId: "connection_1",
        includeClickstream: true,
        keyword: "standing desk",
        locationKey: "ES/ES-AN",
        projectId: "project_1",
      }),
    ).toBe(`km:v1:project_1:connection_1:ES/ES-AN:1:${metricsHash}`);
  });

  it("reuses the literal derived-city metrics key before a paid call", async () => {
    mocks.read.mockResolvedValue(cachedMetrics);

    await expect(
      fetchKeywordMetrics({
        includeClickstream: false,
        keywords: ["Standing Desk"],
        projectId: "project_1",
      }),
    ).resolves.toMatchObject({ cachedCount: 1, fetchedCount: 0, ok: true });

    expect(mocks.read).toHaveBeenCalledWith(
      `km:v1:project_1:connection_1:ES/ES-AN/Malaga:0:${metricsHash}`,
    );
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.metrics).not.toHaveBeenCalled();
  });

  it("reuses the literal city lookup key through the research service", async () => {
    mocks.withCache.mockResolvedValue({
      cached: true,
      status: "success",
      value: {
        costCents: 0,
        fetchedAt: "2026-07-22T08:00:00.000Z",
        rows: [],
      },
    });

    await expect(
      researchKeywords({
        includeClickstream: false,
        mode: "related",
        projectId: "project_1",
        resultLimit: 100,
        seed: "Standing Desk",
      }),
    ).resolves.toMatchObject({ cached: true, costCents: 0, ok: true });

    expect(mocks.withCache).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "kr:v2:project_1:connection_1:standing desk:Spain:es:related:100:0",
      }),
    );
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("degrades the city only for the provider source call", async () => {
    await callResearchSource({
      includeClickstream: false,
      limit: 100,
      location: cityLocation,
      projectId: "project_1",
      rateContext: { entries: [], manualAmountCents: null } as never,
      seed: "standing desk",
      selected: selection as never,
      source: "related",
    });

    const expectedLocation = referenceBase ? cityLocation : countryLocation;
    expect(mocks.related).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        location: expect.objectContaining({
          gl: expectedLocation.gl,
          hl: expectedLocation.hl,
          primaryGeoCode: expectedLocation.primaryGeoCode,
          primaryGeoName: expectedLocation.primaryGeoName,
        }),
      }),
    );
  });

  it("keeps matching city rows annotated as tracked and saved", () => {
    expect(
      annotateResearchResult(
        {
          cached: true,
          cachedUntil: "2026-07-22T20:00:00.000Z",
          costCents: 0,
          fetchedAt: "2026-07-22T08:00:00.000Z",
          rows: [
            {
              competition: null,
              cpcCents: null,
              difficulty: null,
              intent: null,
              keyword: "Standing Desk",
              monthlyTrend: [],
              searchVolume: 100,
              source: "related",
            },
          ],
          sources: [],
        },
        project as never,
        selection as never,
        [selection] as never,
        "ES/ES-AN/Malaga",
      ),
    ).toMatchObject({ rows: [{ alreadySaved: true, alreadyTracked: true }] });
  });
});
