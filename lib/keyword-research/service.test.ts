import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderLookupSignal } from "./paid-call";
import { researchKeywords } from "./service";

const connectionPublicId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  ideas: vi.fn(),
  paidCall: vi.fn(),
  project: vi.fn(),
  related: vi.fn(),
  readCache: vi.fn(),
  suggestions: vi.fn(),
  withCache: vi.fn(),
}));

const cacheKeySpy = vi.fn();

vi.mock("server-only", () => ({}));
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
  researchLocation: () =>
    Promise.resolve({
      key: "US",
      value: {
        gl: "us",
        hl: "en",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
      },
    }),
}));
vi.mock("./cache", () => ({
  keywordResearchCachedUntil: (fetchedAts: string | string[]) => {
    const values = (Array.isArray(fetchedAts) ? fetchedAts : [fetchedAts]).map((value) =>
      new Date(value).getTime(),
    );
    return new Date(Math.min(...values) + 12 * 60 * 60 * 1000).toISOString();
  },
  keywordResearchCacheKey: (input: { source: string }) => {
    cacheKeySpy(input);
    return `kr:${input.source}`;
  },
  readKeywordResearchCache: mocks.readCache,
  withKeywordResearchCache: mocks.withCache,
}));
vi.mock("./paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paid-call")>()),
  paidProviderCall: mocks.paidCall,
}));
vi.mock("./metrics", () => ({ fetchKeywordMetrics: vi.fn() }));

const provider = {
  fetchKeywordIdeas: mocks.ideas,
  fetchKeywordSuggestions: mocks.suggestions,
  fetchRelatedKeywords: mocks.related,
  id: "dataforseo",
  label: "DataForSEO",
};
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
  keywords: [{ text: "tracked keyword" }],
  savedKeywords: [],
};

function row(keyword: string) {
  return {
    competition: null,
    cpcCents: null,
    difficulty: null,
    intent: null,
    keyword,
    monthlyTrend: [],
    searchVolume: null,
  };
}

function run(overrides: Partial<Parameters<typeof researchKeywords>[0]> = {}) {
  return researchKeywords({
    includeClickstream: false,
    mode: "auto",
    projectId: "project_1",
    resultLimit: 2,
    seed: "Seed",
    ...overrides,
  });
}

describe("keyword research service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue(project);
    mocks.readCache.mockResolvedValue(null);
    mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
      cached: false,
      status: "success",
      value: await load(),
    }));
    mocks.paidCall.mockImplementation(
      ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
    );
    mocks.related.mockResolvedValue({ costCents: 1, rows: [row("seed"), row("Alpha")] });
    mocks.suggestions.mockResolvedValue({ costCents: 2, rows: [row("alpha"), row("Beta")] });
    mocks.ideas.mockResolvedValue({ costCents: 3, rows: [row("Gamma")] });
  });

  it("auto cascades, excludes the seed, deduplicates, and stops at the limit", async () => {
    await expect(run()).resolves.toMatchObject({
      cached: false,
      costCents: 3,
      ok: true,
      rows: [
        { alreadyTracked: false, keyword: "Alpha", source: "related" },
        { alreadyTracked: false, keyword: "Beta", source: "suggestion" },
      ],
      sources: [
        { costCents: 1, returned: 2, source: "related", status: "ok" },
        { costCents: 2, returned: 2, source: "suggestion", status: "ok" },
        { reason: "result_limit", source: "idea", status: "skipped" },
      ],
    });
    expect(mocks.ideas).not.toHaveBeenCalled();
  });

  it("keys on the resolved SerpRankLocation, not the city-level canonical key", async () => {
    await run();
    expect(cacheKeySpy).toHaveBeenCalled();
    for (const input of cacheKeySpy.mock.calls.map((call) => call[0])) {
      expect(input.location).toEqual(
        expect.objectContaining({ gl: "us", hl: "en", primaryGeoName: "United States" }),
      );
      expect(typeof input.location).toBe("object");
      expect(input.locationKey).toBeUndefined();
    }
  });

  it("selects by public ID while keeping the internal ID for provider work", async () => {
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

  it("annotates tracked rows and marks per-source cache diagnostics", async () => {
    mocks.withCache.mockResolvedValue({
      cached: true,
      status: "success",
      value: {
        costCents: 1,
        fetchedAt: "2026-07-22T10:00:00.000Z",
        rows: [row("Tracked Keyword")],
      },
    });
    await expect(run({ mode: "ideas" })).resolves.toMatchObject({
      cached: true,
      rows: [{ alreadyTracked: true }],
      sources: [{ cached: true }],
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("annotates saved rows by normalized text and active location", async () => {
    mocks.project.mockResolvedValue({
      ...project,
      savedKeywords: [
        { location: "US", normalizedText: "saved keyword" },
        { location: "GB", normalizedText: "other market" },
      ],
    });
    mocks.withCache.mockResolvedValue({
      cached: true,
      status: "success",
      value: {
        costCents: 1,
        fetchedAt: "2026-07-22T10:00:00.000Z",
        rows: [row("Saved   Keyword"), row("Other Market")],
      },
    });

    await expect(run({ mode: "ideas" })).resolves.toMatchObject({
      rows: [
        { alreadySaved: true, keyword: "Saved   Keyword" },
        { alreadySaved: false, keyword: "Other Market" },
      ],
    });
  });

  it("returns the earliest server cache expiry across successful sources", async () => {
    mocks.withCache
      .mockResolvedValueOnce({
        cached: true,
        status: "success",
        value: {
          costCents: 1,
          fetchedAt: "2026-07-22T10:15:00.000Z",
          rows: [row("Alpha")],
        },
      })
      .mockResolvedValueOnce({
        cached: true,
        status: "success",
        value: {
          costCents: 2,
          fetchedAt: "2026-07-22T10:00:00.000Z",
          rows: [row("Beta")],
        },
      })
      .mockResolvedValueOnce({
        cached: true,
        status: "success",
        value: {
          costCents: 3,
          fetchedAt: "2026-07-22T10:30:00.000Z",
          rows: [row("Gamma")],
        },
      });

    await expect(run({ resultLimit: 10 })).resolves.toMatchObject({
      cachedUntil: "2026-07-22T22:00:00.000Z",
      fetchedAt: "2026-07-22T10:30:00.000Z",
      ok: true,
    });
  });

  it("returns partial success when a later source exhausts the budget", async () => {
    mocks.paidCall
      .mockImplementationOnce(({ call }: { call: (credentials: object) => Promise<unknown> }) =>
        call({}),
      )
      .mockRejectedValueOnce(new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" }));
    const outcome = await run();
    expect(outcome).toMatchObject({
      ok: true,
      rows: [{ keyword: "Alpha" }],
      sources: [
        { source: "related", status: "ok" },
        { reason: "budget_exhausted", source: "suggestion", status: "failed" },
        { reason: "previous_source_failed", source: "idea", status: "skipped" },
      ],
    });
    expect(
      outcome.ok ? new Date(outcome.cachedUntil).getTime() : Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(Date.now());
  });

  it("returns partial success when a later source has an unexpected provider failure", async () => {
    mocks.paidCall
      .mockImplementationOnce(({ call }: { call: (credentials: object) => Promise<unknown> }) =>
        call({}),
      )
      .mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(run()).resolves.toMatchObject({
      ok: true,
      sources: [
        { source: "related", status: "ok" },
        { reason: "provider_error", source: "suggestion", status: "failed" },
        { reason: "previous_source_failed", source: "idea", status: "skipped" },
      ],
    });
  });

  it("reuses a successful source after partial failure and does not add another ledgered call", async () => {
    const sourceCache = new Map<string, unknown>();
    mocks.withCache.mockImplementation(
      async ({ key, load }: { key: string; load: () => Promise<unknown> }) => {
        if (sourceCache.has(key)) {
          return { cached: true, status: "success", value: sourceCache.get(key) };
        }
        const value = await load();
        sourceCache.set(key, value);
        return { cached: false, status: "success", value };
      },
    );
    let ledgerRows = 0;
    mocks.paidCall.mockImplementation(async ({ call }) => {
      if (ledgerRows === 1) {
        ledgerRows += 1;
        throw new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" });
      }
      const value = await call({});
      ledgerRows += 1;
      return value;
    });
    await run();
    await run();
    expect(mocks.related).toHaveBeenCalledOnce();
    expect(ledgerRows).toBe(3);
  });

  it("returns the plain error when the first source fails", async () => {
    mocks.paidCall.mockRejectedValueOnce(
      new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" }),
    );
    await expect(run()).resolves.toEqual({ ok: false, reason: "budget_exhausted" });
  });

  it("estimates each uncached source without calling the provider", async () => {
    await expect(run({ estimateOnly: true })).resolves.toMatchObject({
      estimate: true,
      rows: [],
      sources: [
        { cached: false, source: "related", status: "ok" },
        { cached: false, source: "suggestion", status: "ok" },
        { cached: false, source: "idea", status: "ok" },
      ],
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("stops auto mode at max cost and returns partial success", async () => {
    await expect(run({ maxCostCents: 2 })).resolves.toMatchObject({
      ok: true,
      sources: [
        { source: "related", status: "ok" },
        { reason: "cost_limit", source: "suggestion", status: "skipped" },
        { reason: "cost_limit", source: "idea", status: "skipped" },
      ],
    });
    expect(mocks.suggestions).not.toHaveBeenCalled();
  });

  it("returns an empty auto estimate guard response when the first source exceeds max cost", async () => {
    await expect(run({ maxCostCents: 1 })).resolves.toMatchObject({
      ok: true,
      rows: [],
      sources: [
        { reason: "cost_limit", source: "related", status: "skipped" },
        { reason: "cost_limit", source: "suggestion", status: "skipped" },
        { reason: "cost_limit", source: "idea", status: "skipped" },
      ],
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });

  it("returns 422 outcome when a sole research source exceeds max cost", async () => {
    await expect(run({ maxCostCents: 1, mode: "related" })).resolves.toEqual({
      ok: false,
      reason: "cost_limit_exceeded",
    });
  });

  it.each(["budget_exhausted", "needs_reauth", "rate_limited", "unsupported_location"] as const)(
    "maps %s without caching an error",
    async (reason) => {
      mocks.paidCall.mockRejectedValue(
        new ProviderLookupSignal({ ok: false, reason, resetAt: 123 }),
      );
      await expect(run()).resolves.toMatchObject({ ok: false, reason });
    },
  );

  it("rejects an ineligible connection", async () => {
    await expect(run({ connectionId: "conn_b00000000000000000000000" })).resolves.toEqual({
      ok: false,
      reason: "no_source",
    });
  });
});
