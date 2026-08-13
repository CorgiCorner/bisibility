import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeDomainOverview,
  loadDomainKeywordsPage,
  loadDomainOverviewHistory,
  loadDomainPagesPage,
} from "./service";

const mocks = vi.hoisted(() => ({
  assertMaxCost: vi.fn(),
  estimate: vi.fn(),
  fetchHistory: vi.fn(),
  fetchKeywords: vi.fn(),
  fetchPages: vi.fn(),
  findSnapshot: vi.fn(),
  findSnapshotMetadata: vi.fn(),
  loadModule: vi.fn(),
  persistHistory: vi.fn(),
  persistModules: vi.fn(),
  preflight: vi.fn(),
  requireSource: vi.fn(),
  readCache: vi.fn(),
  resolveSnapshot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./context", () => ({
  requireDomainOverviewSource: mocks.requireSource,
}));
vi.mock("./provider-call", () => ({
  assertDomainOverviewMaxCost: mocks.assertMaxCost,
  domainOverviewCostReservation: (maxCostCents: number | undefined) => {
    let reserved = 0;
    return (nextCostCents: number) => {
      mocks.assertMaxCost(reserved + nextCostCents, maxCostCents);
      reserved += nextCostCents;
    };
  },
  domainOverviewEstimate: mocks.estimate,
  fetchDomainHistory: mocks.fetchHistory,
  fetchDomainKeywords: mocks.fetchKeywords,
  fetchDomainPages: mocks.fetchPages,
  preflightDomainOverview: mocks.preflight,
}));
vi.mock("./snapshot", () => ({
  findDomainOverviewSnapshot: mocks.findSnapshot,
  findDomainOverviewSnapshotMetadata: mocks.findSnapshotMetadata,
  persistDomainOverviewHistory: mocks.persistHistory,
  persistDomainOverviewModules: mocks.persistModules,
  resolveDomainOverviewSnapshot: mocks.resolveSnapshot,
}));
vi.mock("./cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cache")>()),
  loadDomainOverviewModule: mocks.loadModule,
  readDomainOverviewCache: mocks.readCache,
}));

const metrics = {
  count: 120,
  estimatedTrafficCostCents: 4_200,
  etv: 8_100,
  isDown: 3,
  isLost: 1,
  isNew: 7,
  isUp: 11,
  pos1: 2,
  pos11_20: 20,
  pos21_30: 18,
  pos2_3: 5,
  pos31_40: 12,
  pos41_50: 10,
  pos4_10: 25,
  pos51_60: 8,
  pos61_70: 7,
  pos71_80: 5,
  pos81_90: 4,
  pos91_100: 4,
};

const project = {
  budgetCapCents: 500,
  id: "project_1",
  providerConnections: [],
  publicId: "prj_1",
};
const source = {
  connection: {
    credentialsEncrypted: "encrypted",
    id: "connection_1",
    provider: "dataforseo",
  },
  provider: {
    fetchDomainRankOverview: vi.fn(),
    fetchHistoricalRankOverview: vi.fn(),
    fetchRankedKeywords: vi.fn(),
    fetchRelevantPages: vi.fn(),
    id: "dataforseo",
    label: "DataForSEO",
  },
};
const keywordPage = { costCents: 2, rows: [], totalCount: 12 };
const pageResult = { costCents: 3, rows: [], totalCount: 4 };
const history = [{ metrics, month: 7, year: 2026 }];

function snapshotData(overview: typeof metrics | null = metrics) {
  return {
    cachedUntil: "2026-08-12T12:00:00.000Z",
    fetchedAt: "2026-08-11T12:00:00.000Z",
    overview,
    previousFetchedAt: null,
    previousOverview: null,
    previousSourceSnapshotAt: null,
    provider: "dataforseo",
    sourceSnapshotAt: "2026-08-10T00:00:00.000Z",
  };
}

function analyze(overrides: Record<string, unknown> = {}) {
  return analyzeDomainOverview(
    { projectId: "prj_1" },
    { languageCode: "EN", locationCode: 2840, target: "https://www.example.com", ...overrides },
  );
}

function loadHistory(overrides: Record<string, unknown> = {}) {
  return loadDomainOverviewHistory(
    { projectId: "prj_1" },
    { languageCode: "EN", locationCode: 2840, target: "example.com", ...overrides },
  );
}

describe("domain overview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSource.mockResolvedValue({ project, source });
    mocks.estimate.mockReturnValue({ core: 6, history: 10, keywords: 2, overview: 1, pages: 3 });
    mocks.assertMaxCost.mockImplementation((cost: number, maximum?: number) => {
      if (maximum !== undefined && cost > maximum) {
        throw new ProviderLookupSignal({ ok: false, reason: "cost_limit_exceeded" });
      }
    });
    mocks.preflight.mockResolvedValue(undefined);
    mocks.findSnapshotMetadata.mockResolvedValue(null);
    mocks.readCache.mockResolvedValue(null);
    mocks.resolveSnapshot.mockImplementation(
      async ({ beforeLoad }: { beforeLoad?: () => void }) => {
        beforeLoad?.();
        return { cached: false, costCents: 1, data: snapshotData() };
      },
    );
    mocks.fetchKeywords.mockResolvedValue(keywordPage);
    mocks.fetchPages.mockResolvedValue(pageResult);
    mocks.fetchHistory.mockResolvedValue({ costCents: 10, rows: history });
    mocks.findSnapshot.mockResolvedValue({ id: "snapshot_1" });
    mocks.persistHistory.mockResolvedValue({ id: "snapshot_1" });
    mocks.persistModules.mockResolvedValue({ count: 1 });
    mocks.loadModule.mockImplementation(
      async ({ beforeLoad, load }: { beforeLoad?: () => void; load: () => Promise<unknown> }) => {
        try {
          beforeLoad?.();
          const value = (await load()) as { costCents: number; data: unknown };
          return {
            cached: false,
            costCents: value.costCents,
            data: value.data,
            fetchedAt: "2026-08-11T12:00:00.000Z",
            ok: true,
          };
        } catch (error) {
          return error instanceof ProviderLookupSignal
            ? { ...error.outcome, costCents: error.outcome.costCents ?? 0 }
            : { costCents: 0, ok: false, reason: "lookup_failed" };
        }
      },
    );
  });

  it("returns a complete cache hit under a zero cost limit with no provider work", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1" });
    mocks.readCache.mockResolvedValue({ cached: true });
    mocks.resolveSnapshot.mockResolvedValue({ cached: true, costCents: 0, data: snapshotData() });
    mocks.loadModule
      .mockResolvedValueOnce({
        cached: true,
        costCents: 0,
        data: keywordPage,
        fetchedAt: "2026-08-11T12:00:00.000Z",
        ok: true,
      })
      .mockResolvedValueOnce({
        cached: true,
        costCents: 0,
        data: pageResult,
        fetchedAt: "2026-08-11T12:00:00.000Z",
        ok: true,
      });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      ok: true,
      state: "ok",
    });
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("loads all automatic modules on a cache miss", async () => {
    await expect(analyze()).resolves.toMatchObject({
      cached: false,
      costCents: 6,
      keywords: { costCents: 2, ok: true },
      ok: true,
      pages: { costCents: 3, ok: true },
      state: "ok",
    });
    expect(mocks.preflight).toHaveBeenCalledWith({
      budgetCapCents: 500,
      estimatedCostCents: 6,
      projectId: "project_1",
    });
    expect(mocks.fetchKeywords).toHaveBeenCalledOnce();
    expect(mocks.fetchPages).toHaveBeenCalledOnce();
    expect(mocks.persistModules).toHaveBeenCalledWith({
      expectedFetchedAt: "2026-08-11T12:00:00.000Z",
      keywordLimit: 100,
      keywords: keywordPage,
      languageCode: "en",
      locationCode: 2840,
      pageLimit: 100,
      pages: pageResult,
      projectId: "project_1",
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
    });
    expect(mocks.readCache).toHaveBeenCalledTimes(2);
  });

  it("starts independent keyword and page modules concurrently", async () => {
    let releaseKeywords: (() => void) | undefined;
    mocks.fetchKeywords.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseKeywords = () => resolve(keywordPage);
        }),
    );

    const pending = analyze();
    await vi.waitFor(() => expect(mocks.fetchPages).toHaveBeenCalledOnce());
    releaseKeywords?.();
    await expect(pending).resolves.toMatchObject({ ok: true, state: "ok" });
  });

  it("returns a free durable estimate without loading provider data", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1" });
    mocks.readCache
      .mockResolvedValueOnce({ cached: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ cached: true });

    await expect(analyze({ estimateOnly: true })).resolves.toMatchObject({
      cached: true,
      estimate: true,
      estimatedCostCents: 0,
      freshEstimatedCostCents: 6,
      historyEstimatedCostCents: 0,
      historyMode: "lazy",
      languageCode: "en",
      ok: true,
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
    });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
  });

  it("prices any active durable report as free when Redis table pages are unavailable", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache.mockResolvedValue(null);

    await expect(analyze({ estimateOnly: true })).resolves.toMatchObject({
      cached: true,
      estimate: true,
      estimatedCostCents: 0,
      ok: true,
    });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.loadModule).not.toHaveBeenCalled();
  });

  it("reopens a durable report as a free partial result when Redis and table copies are absent", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache.mockResolvedValue(null);
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(),
      durable: true,
      modules: { keywords: null, pages: null },
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      keywords: { costCents: 0, ok: false, reason: "lookup_failed" },
      ok: true,
      overview: metrics,
      pages: { costCents: 0, ok: false, reason: "lookup_failed" },
      state: "partial",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("reconstructs a complete cached report from the durable first page", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache.mockResolvedValue(null);
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(),
      durable: true,
      modules: { keywords: keywordPage, pages: pageResult },
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      keywords: { cached: true, costCents: 0, data: keywordPage, ok: true },
      ok: true,
      pages: { cached: true, costCents: 0, data: pageResult, ok: true },
      state: "ok",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
  });

  it("hydrates a legacy durable report from Redis without provider work", async () => {
    const fetchedAt = "2026-08-11T12:00:00.000Z";
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache
      .mockResolvedValueOnce({ costCents: 2, data: keywordPage, fetchedAt })
      .mockResolvedValueOnce({ costCents: 3, data: pageResult, fetchedAt });
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(),
      durable: true,
      modules: { keywords: null, pages: null },
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      keywords: { data: keywordPage, ok: true },
      ok: true,
      pages: { data: pageResult, ok: true },
      state: "ok",
    });
    expect(mocks.persistModules).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedFetchedAt: fetchedAt,
        keywords: keywordPage,
        pages: pageResult,
        provider: "dataforseo",
      }),
    );
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("does not attach an older Redis table page to a newer partial refresh", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache
      .mockResolvedValueOnce({
        costCents: 2,
        data: keywordPage,
        fetchedAt: "2026-08-11T11:00:00.000Z",
      })
      .mockResolvedValueOnce(null);
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(),
      durable: true,
      modules: { keywords: null, pages: null },
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      keywords: { costCents: 0, ok: false, reason: "lookup_failed" },
      ok: true,
      state: "partial",
    });
    expect(mocks.persistModules).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
  });

  it("keeps the durable overview visible when the Redis probe times out", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1", overview: metrics });
    mocks.readCache.mockResolvedValue(undefined);
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(),
      durable: true,
      modules: { keywords: null, pages: null },
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      ok: true,
      overview: metrics,
      state: "partial",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
  });

  it("treats a cached no-data snapshot as a complete free report", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({
      fetchedAt: new Date("2026-08-12T08:00:00.000Z"),
      overview: null,
    });
    mocks.readCache.mockResolvedValue(null);

    await expect(analyze({ estimateOnly: true })).resolves.toMatchObject({
      cached: true,
      estimate: true,
      estimatedCostCents: 0,
      ok: true,
    });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
  });

  it("reopens a cached no-data snapshot under a zero cost cap", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({
      fetchedAt: new Date("2026-08-12T08:00:00.000Z"),
      overview: null,
    });
    mocks.readCache.mockResolvedValue(null);
    mocks.resolveSnapshot.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: snapshotData(null),
    });

    await expect(analyze({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      ok: true,
      state: "no_data",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("rechecks a zero cap immediately before an overview provider call after a cache race", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1" });
    mocks.readCache.mockResolvedValue({ cached: true });

    await expect(analyze({ maxCostCents: 0 })).resolves.toEqual({
      costCents: 0,
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("reserves aggregate module cost before provider calls when cached modules disappear", async () => {
    mocks.findSnapshotMetadata.mockResolvedValue({ id: "snapshot_1" });
    mocks.readCache.mockResolvedValue({ cached: true });
    mocks.resolveSnapshot.mockResolvedValue({ cached: true, costCents: 0, data: snapshotData() });

    await expect(analyze({ maxCostCents: 2 })).resolves.toMatchObject({
      keywords: { costCents: 2, ok: true },
      ok: true,
      pages: { costCents: 0, ok: false, reason: "cost_limit_exceeded" },
      state: "partial",
    });
    expect(mocks.fetchKeywords).toHaveBeenCalledOnce();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("fresh bypasses every cache probe and forwards the refresh flag", async () => {
    await expect(analyze({ fresh: true })).resolves.toMatchObject({ cached: false, ok: true });
    expect(mocks.findSnapshotMetadata).not.toHaveBeenCalled();
    expect(mocks.readCache).not.toHaveBeenCalled();
    expect(mocks.resolveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ fresh: true }));
    expect(mocks.loadModule).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.loadModule.mock.calls) {
      expect(input).toMatchObject({ fresh: true });
    }
  });

  it("reports a partial result when one automatic module fails", async () => {
    mocks.loadModule.mockImplementation(
      async ({ key, load }: { key: string; load: () => Promise<unknown> }) => {
        if (key.includes(":pages:")) {
          return { costCents: 4, ok: false, reason: "rate_limited", resetAt: 123 };
        }
        const value = (await load()) as { costCents: number; data: unknown };
        return {
          cached: false,
          costCents: value.costCents,
          data: value.data,
          fetchedAt: "2026-08-11T12:00:00.000Z",
          ok: true,
        };
      },
    );

    await expect(analyze()).resolves.toMatchObject({
      costCents: 7,
      ok: true,
      pages: { ok: false, reason: "rate_limited", resetAt: 123 },
      state: "partial",
    });
  });

  it("propagates budget exhaustion before any provider module", async () => {
    mocks.preflight.mockRejectedValue(
      new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" }),
    );

    await expect(analyze()).resolves.toEqual({
      costCents: 0,
      ok: false,
      reason: "budget_exhausted",
    });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.loadModule).not.toHaveBeenCalled();
  });

  it("propagates a provider reauthentication signal", async () => {
    mocks.resolveSnapshot.mockRejectedValue(
      new ProviderLookupSignal({ ok: false, reason: "needs_reauth" }),
    );

    await expect(analyze()).resolves.toEqual({ costCents: 0, ok: false, reason: "needs_reauth" });
    expect(mocks.loadModule).not.toHaveBeenCalled();
  });

  it("returns no_data without loading keywords or pages", async () => {
    mocks.resolveSnapshot.mockResolvedValue({
      cached: false,
      costCents: 1,
      data: snapshotData(null),
    });

    await expect(analyze()).resolves.toMatchObject({
      costCents: 1,
      keywords: { cached: true, costCents: 0, data: { rows: [], totalCount: 0 }, ok: true },
      ok: true,
      pages: { cached: true, costCents: 0, data: { rows: [], totalCount: 0 }, ok: true },
      state: "no_data",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.fetchKeywords).not.toHaveBeenCalled();
    expect(mocks.fetchPages).not.toHaveBeenCalled();
  });

  it("returns snapshot_expired before loading paid history", async () => {
    mocks.findSnapshot.mockResolvedValue(null);

    await expect(loadHistory()).resolves.toEqual({
      costCents: 0,
      ok: false,
      reason: "snapshot_expired",
    });
    expect(mocks.loadModule).not.toHaveBeenCalled();
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
  });

  it("returns lazy history from cache without fetching or persisting", async () => {
    mocks.loadModule.mockResolvedValue({
      cached: true,
      costCents: 0,
      data: history,
      fetchedAt: "2026-08-11T12:00:00.000Z",
      ok: true,
    });

    await expect(loadHistory({ maxCostCents: 0 })).resolves.toMatchObject({
      cached: true,
      costCents: 0,
      ok: true,
    });
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
    expect(mocks.persistHistory).not.toHaveBeenCalled();
  });

  it("fetches and persists lazy history on a cache miss", async () => {
    await expect(loadHistory()).resolves.toMatchObject({
      cached: false,
      costCents: 10,
      data: history,
      ok: true,
    });
    expect(mocks.fetchHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        languageCode: "en",
        locationCode: 2840,
        projectId: "project_1",
        scope: "root",
        target: "example.com",
      }),
    );
    expect(mocks.persistHistory).toHaveBeenCalledWith({
      history,
      languageCode: "en",
      locationCode: 2840,
      projectId: "project_1",
      scope: "root",
      target: "example.com",
    });
  });

  it("enforces the lazy-history max cost after a cache miss and before provider work", async () => {
    await expect(loadHistory({ maxCostCents: 9 })).resolves.toEqual({
      costCents: 0,
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.findSnapshot).toHaveBeenCalledOnce();
    expect(mocks.loadModule).toHaveBeenCalledOnce();
    expect(mocks.fetchHistory).not.toHaveBeenCalled();
  });

  it("loads normalized keyword and page offsets under distinct cache keys", async () => {
    const options = {
      languageCode: "EN",
      limit: 250,
      locationCode: 2840,
      offset: 1_250,
      target: "https://www.example.com",
    };

    await loadDomainKeywordsPage({ projectId: "prj_1" }, options);
    await loadDomainPagesPage({ projectId: "prj_1" }, options);

    expect(mocks.fetchKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 250, offset: 1_250, target: "example.com" }),
    );
    expect(mocks.fetchPages).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 250, offset: 1_250, target: "example.com" }),
    );
    expect(mocks.loadModule.mock.calls[0]?.[0].key).toContain(":keywords:");
    expect(mocks.loadModule.mock.calls[1]?.[0].key).toContain(":pages:");
    expect(mocks.loadModule.mock.calls[0]?.[0].key).toContain(":250:1250");
  });
});
