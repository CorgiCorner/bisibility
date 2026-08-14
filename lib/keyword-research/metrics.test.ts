import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchKeywordMetrics } from "./metrics";
import { ProviderLookupSignal } from "./paid-call";

const connectionPublicId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  fetch: vi.fn(),
  paidCall: vi.fn(),
  project: vi.fn(),
  read: vi.fn(),
  release: vi.fn(),
  resetAt: vi.fn(),
  supportsResearchMarket: vi.fn(),
  wait: vi.fn(),
  write: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: () => Promise.resolve({ entries: [], manualAmountCents: null }),
}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  acquireProviderLookupLock: mocks.acquire,
  providerLookupCacheConfigured: () => true,
  providerLookupContentionResetAt: mocks.resetAt,
  readProviderLookupCache: mocks.read,
  releaseProviderLookupLock: mocks.release,
  waitForProviderLookupCache: mocks.wait,
}));
vi.mock("./cache", () => ({
  keywordMetricsCacheKey: ({ keyword }: { keyword: string }) => `km:${keyword}`,
  writeKeywordMetricsCache: mocks.write,
}));
vi.mock("@/lib/serp/market-capability", () => ({
  researchProviderRankLocation: (location: unknown) => location,
  supportsResearchMarket: mocks.supportsResearchMarket,
}));
vi.mock("./context", () => ({
  connectionResources: () => [
    { id: connectionPublicId, label: "DataForSEO", provider: "dataforseo" },
  ],
  eligibleResearchConnections: (project: { eligible: unknown[] }) => project.eligible,
  keywordResearchProject: mocks.project,
  normalizeResearchKeyword: (value: string) => value.trim().toLowerCase(),
  researchLocation: () => Promise.resolve({ key: "US", value: { hl: "en" } }),
}));
vi.mock("./paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paid-call")>()),
  paidProviderCall: mocks.paidCall,
}));

const metrics = {
  competition: 0.2,
  cpcCents: 50,
  difficulty: 30,
  intent: "commercial" as const,
  monthlyTrend: [],
  searchVolume: 100,
};
const provider = { fetchKeywordMetrics: mocks.fetch, id: "dataforseo", label: "DataForSEO" };
const project = {
  eligible: [
    {
      connection: {
        credentialsEncrypted: "secret",
        id: "connection_1",
        provider: "dataforseo",
        publicId: connectionPublicId,
      },
      provider,
    },
  ],
  id: "project_1",
};

function run(overrides: Partial<Parameters<typeof fetchKeywordMetrics>[0]> = {}) {
  return fetchKeywordMetrics({
    includeClickstream: false,
    keywords: ["Alpha", "Beta"],
    projectId: "project_1",
    ...overrides,
  });
}

describe("keyword metrics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue(project);
    mocks.acquire.mockResolvedValue({ key: "lock", token: "token" });
    mocks.release.mockResolvedValue(undefined);
    mocks.resetAt.mockResolvedValue(123_456);
    mocks.wait.mockResolvedValue(null);
    mocks.write.mockResolvedValue(true);
    mocks.supportsResearchMarket.mockReturnValue(true);
    mocks.fetch.mockResolvedValue({ costCents: 1.01, rows: [{ keyword: "Beta", ...metrics }] });
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
    );
  });

  it("hydrates only cache misses and reports cached and fetched counts", async () => {
    mocks.read
      .mockResolvedValueOnce({
        fetchedAt: "2026-07-22T09:00:00.000Z",
        keyword: "Alpha",
        ...metrics,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await expect(run()).resolves.toMatchObject({
      cachedCount: 1,
      costCents: 1.01,
      fetchedCount: 1,
      ok: true,
      rows: [{ keyword: "Alpha" }, { keyword: "Beta" }],
    });
    expect(mocks.fetch).toHaveBeenCalledWith({}, expect.objectContaining({ keywords: ["Beta"] }));
    expect(mocks.write).toHaveBeenCalledWith(
      "km:beta",
      expect.objectContaining({ keyword: "Beta" }),
    );
  });

  it("selects by public ID while keeping the internal ID for provider work", async () => {
    mocks.read.mockResolvedValue(null);

    await expect(run({ connectionId: connectionPublicId })).resolves.toMatchObject({
      connections: [{ id: connectionPublicId }],
      ok: true,
    });
    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ id: "connection_1" }),
      }),
    );
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "rejects non-public connection selection %s",
    async (connectionId) => {
      await expect(run({ connectionId })).rejects.toMatchObject({ code: "invalid_public_id" });
      expect(mocks.paidCall).not.toHaveBeenCalled();
    },
  );

  it("fresh bypasses per-keyword reads and fetches the whole batch", async () => {
    mocks.fetch.mockResolvedValue({
      costCents: 1.02,
      rows: [
        { keyword: "Alpha", ...metrics },
        { keyword: "Beta", ...metrics },
      ],
    });
    await expect(run({ fresh: true })).resolves.toMatchObject({
      cachedCount: 0,
      fetchedCount: 2,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns cache contention as an in-progress outcome", async () => {
    mocks.read.mockResolvedValue(null);
    mocks.acquire.mockResolvedValue(null);
    await expect(run()).resolves.toMatchObject({
      ok: false,
      reason: "in_progress",
      resetAt: 123_456,
    });
    expect(mocks.resetAt).toHaveBeenCalledWith("km:alpha");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns a free cache-aware estimate without a paid call", async () => {
    mocks.read
      .mockResolvedValueOnce({
        fetchedAt: "2026-07-22T09:00:00.000Z",
        keyword: "Alpha",
        ...metrics,
      })
      .mockResolvedValueOnce(null);
    await expect(run({ estimateOnly: true })).resolves.toMatchObject({
      cachedCount: 1,
      estimate: true,
      estimatedCostCents: 1.01,
      fetchedCount: 0,
      fetchedCountEstimate: 1,
      rows: [],
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it("rejects before a paid call when max cost is below the estimate", async () => {
    mocks.read.mockResolvedValue(null);
    await expect(run({ maxCostCents: 1 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("rejects an unsupported country-language pair before cache or paid work", async () => {
    mocks.supportsResearchMarket.mockReturnValue(false);

    await expect(run()).resolves.toEqual({ ok: false, reason: "unsupported_location" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it.each(["budget_exhausted", "needs_reauth", "unsupported_location"] as const)(
    "maps %s and never writes an error",
    async (reason) => {
      mocks.read.mockResolvedValue(null);
      mocks.paidCall.mockRejectedValue(new ProviderLookupSignal({ ok: false, reason }));
      await expect(run()).resolves.toMatchObject({ ok: false, reason });
      expect(mocks.write).not.toHaveBeenCalled();
    },
  );
});
