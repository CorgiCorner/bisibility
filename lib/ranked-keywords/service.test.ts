import { ProviderAuthError } from "@/lib/providers/auth-error";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRankedKeywords, listEligibleRankedKeywordConnections } from "./service";

const projectPublicId = "prj_a00000000000000000000000";
const connectionPublicId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  acquireLock: vi.fn(),
  assertBudget: vi.fn(),
  consumeLimit: vi.fn(),
  fetchPage: vi.fn(),
  getProvider: vi.fn(),
  markReauth: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    project: { findFirst: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { create: vi.fn() },
  },
  readCache: vi.fn(),
  redisConfigured: vi.fn(),
  releaseLock: vi.fn(),
  waitCache: vi.fn(),
  withCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.markReauth }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "user", password: "secret" }),
}));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.consumeLimit }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudget,
  isBudgetExhaustedError: (error: unknown) =>
    error instanceof Error && error.name === "BudgetExhaustedError",
}));
vi.mock("@/lib/redis/redis", () => ({ redisConfigured: mocks.redisConfigured }));
vi.mock("./cache", () => ({
  acquireRankedKeywordsLock: mocks.acquireLock,
  rankedKeywordsCacheKey: () => "rk:key",
  readRankedKeywordsCache: mocks.readCache,
  releaseRankedKeywordsLock: mocks.releaseLock,
  waitForRankedKeywordsCache: mocks.waitCache,
  withRankedKeywordsCache: mocks.withCache,
  writeRankedKeywordsCache: mocks.writeCache,
}));

const location = {
  canonicalKey: "US",
  cityName: null,
  countryCode: "US",
  displayName: "United States",
  gl: "us",
  hl: "en",
  id: "loc_1",
  kind: "country",
  languageLabel: "English",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  regionCode: null,
  secondaryGeoName: "United States",
};
const project = {
  budgetCapCents: 5_000,
  defaults: {
    country: "United States",
    device: "desktop",
    locationKey: "US",
    locationRef: location,
  },
  domain: "www.example.com",
  id: "project_1",
  keywords: [
    { device: "desktop", location: "United States", locationRef: location, text: "Rank Tracker" },
  ],
  providerConnections: [
    {
      credentialsEncrypted: "encrypted",
      id: "connection_1",
      provider: "dataforseo",
      publicId: connectionPublicId,
    },
  ],
  publicId: projectPublicId,
};
const cacheEntry = {
  costCents: 2,
  fetchedAt: "2026-07-22T10:00:00.000Z",
  rows: [{ estimatedTraffic: 10, keyword: "rank tracker", position: 4, searchVolume: 100 }],
  totalCount: 1,
};

function run(overrides: Partial<Parameters<typeof fetchRankedKeywords>[0]> = {}) {
  return fetchRankedKeywords({ limit: 100, offset: 0, projectId: projectPublicId, ...overrides });
}

describe("ranked-keyword service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertBudget.mockReset();
    mocks.fetchPage.mockReset();
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.providerCostEntry.create.mockReset();
    mocks.prisma.providerConnectionRate.findMany.mockReset();
    mocks.readCache.mockReset();
    mocks.releaseLock.mockReset();
    mocks.waitCache.mockReset();
    mocks.withCache.mockReset();
    mocks.writeCache.mockReset();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.getProvider.mockReturnValue({
      id: "dataforseo",
      label: "DataForSEO",
      fetchRankedKeywords: mocks.fetchPage,
    });
    mocks.redisConfigured.mockReturnValue(true);
    mocks.acquireLock.mockResolvedValue({ key: "rk:key:lock", token: "token" });
    mocks.readCache.mockResolvedValue(null);
    mocks.waitCache.mockResolvedValue(null);
    mocks.assertBudget.mockResolvedValue({ capCents: 5_000, spentCents: 0 });
    mocks.consumeLimit.mockResolvedValue({ resetAt: Date.now() + 60_000, success: true });
    mocks.fetchPage.mockResolvedValue(cacheEntry);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.create.mockResolvedValue({ id: "cost_1" });
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.releaseLock.mockResolvedValue(undefined);
    mocks.writeCache.mockResolvedValue(true);
    mocks.withCache.mockImplementation(
      async (input: { load: () => Promise<typeof cacheEntry> }) => ({
        cached: false,
        status: "success",
        value: await input.load(),
      }),
    );
  });

  it("returns a cache hit without budget, limiter, or provider work", async () => {
    mocks.withCache.mockResolvedValue({ cached: true, status: "success", value: cacheEntry });
    await expect(run()).resolves.toMatchObject({
      cached: true,
      ok: true,
      rows: [{ alreadyTracked: true }],
    });
    expect(mocks.assertBudget).not.toHaveBeenCalled();
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.create).not.toHaveBeenCalled();
  });

  it("selects and returns only the public connection ID", async () => {
    await expect(run({ connectionId: connectionPublicId })).resolves.toMatchObject({
      connections: [{ id: connectionPublicId }],
      ok: true,
    });
    expect(mocks.withCache).toHaveBeenCalledWith(expect.objectContaining({ key: "rk:key" }));
    expect(mocks.prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          providerConnections: expect.objectContaining({
            select: expect.objectContaining({ publicId: true }),
          }),
        }),
      }),
    );
  });

  it("waits on lock contention and returns the concurrent cached page", async () => {
    mocks.withCache.mockResolvedValue({ cached: true, status: "success", value: cacheEntry });
    await expect(run()).resolves.toMatchObject({ cached: true, ok: true });
    expect(mocks.withCache).toHaveBeenCalledWith(expect.objectContaining({ key: "rk:key" }));
    expect(mocks.prisma.providerCostEntry.create).not.toHaveBeenCalled();
  });

  it("checks the cache again after acquiring the lock to avoid duplicate spend", async () => {
    mocks.withCache.mockResolvedValue({ cached: true, status: "success", value: cacheEntry });

    await expect(run()).resolves.toMatchObject({ cached: true, ok: true });

    expect(mocks.withCache).toHaveBeenCalledOnce();
    expect(mocks.assertBudget).not.toHaveBeenCalled();
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it("returns rate_limited after lock polling is exhausted", async () => {
    mocks.withCache.mockResolvedValue({ resetAt: 123, status: "contended" });
    await expect(run()).resolves.toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("fresh bypasses an existing cache value and replaces it", async () => {
    await expect(run({ fresh: true })).resolves.toMatchObject({ cached: false, ok: true });
    expect(mocks.withCache).toHaveBeenCalledWith(expect.objectContaining({ fresh: true }));
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerCostEntry.create).toHaveBeenCalledWith({
      data: {
        cached: false,
        connectionId: "connection_1",
        costCents: 2,
        failed: false,
        feature: "ranked_keywords",
        projectId: "project_1",
      },
    });
  });

  it("does not return a stale cache page when fresh contends on a lock", async () => {
    mocks.withCache.mockResolvedValue({ resetAt: 123, status: "contended" });

    await expect(run({ fresh: true })).resolves.toMatchObject({
      ok: false,
      reason: "rate_limited",
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it("caches empty successful pages", async () => {
    mocks.fetchPage.mockResolvedValue({ costCents: 2, rows: [], totalCount: 100 });
    await expect(run({ offset: 100 })).resolves.toMatchObject({ ok: true, rows: [] });
    expect(mocks.withCache).toHaveBeenCalledWith(expect.objectContaining({ key: "rk:key" }));
  });

  it("passes through without cache or locks when Redis is disabled", async () => {
    mocks.redisConfigured.mockReturnValue(false);
    await expect(run()).resolves.toMatchObject({ cached: false, ok: true });
    expect(mocks.readCache).not.toHaveBeenCalled();
    expect(mocks.acquireLock).not.toHaveBeenCalled();
  });

  it("passes through when configured Redis is unavailable during the cache read", async () => {
    mocks.readCache.mockResolvedValue(undefined);

    await expect(run()).resolves.toMatchObject({ cached: false, ok: true });

    expect(mocks.acquireLock).not.toHaveBeenCalled();
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
  });

  it("passes through when configured Redis becomes unavailable while taking the lock", async () => {
    mocks.acquireLock.mockResolvedValue(undefined);

    await expect(run()).resolves.toMatchObject({ cached: false, ok: true });

    expect(mocks.waitCache).not.toHaveBeenCalled();
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
  });

  it("passes through when Redis fails while polling a contended lock", async () => {
    mocks.acquireLock.mockResolvedValue(null);
    mocks.waitCache.mockResolvedValue(undefined);

    await expect(run()).resolves.toMatchObject({ cached: false, ok: true });

    expect(mocks.fetchPage).toHaveBeenCalledOnce();
  });

  it("uses the provider rate table for the budget estimate", async () => {
    await run();
    expect(mocks.assertBudget).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 5_000,
      estimatedCostCents: 2,
    });
  });

  it("returns paid results when ledger, cache, or lock cleanup fails after the provider call", async () => {
    mocks.prisma.providerCostEntry.create.mockRejectedValue(new Error("database unavailable"));

    await expect(run()).resolves.toMatchObject({ cached: false, costCents: 2, ok: true });
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
  });

  it("rejects a connection id that is not eligible", async () => {
    await expect(run({ connectionId: "conn_b00000000000000000000000" })).resolves.toEqual({
      ok: false,
      reason: "no_source",
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it("skips persisted providers that are unavailable in the current runtime", async () => {
    mocks.getProvider.mockImplementation(() => {
      throw new Error("Unknown SERP provider: local-sequence");
    });

    await expect(listEligibleRankedKeywordConnections(projectPublicId)).resolves.toEqual([]);
    await expect(run()).resolves.toEqual({ ok: false, reason: "no_source" });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it("does not hide provider construction failures", async () => {
    mocks.getProvider.mockImplementation(() => {
      throw new Error("Provider configuration is invalid");
    });

    await expect(listEligibleRankedKeywordConnections(projectPublicId)).rejects.toThrow(
      "Provider configuration is invalid",
    );
    await expect(run()).rejects.toThrow("Provider configuration is invalid");
  });

  it("fails closed when a persisted connection has no valid public ID", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      ...project,
      providerConnections: [{ ...project.providerConnections[0], publicId: "connection_1" }],
    });

    await expect(listEligibleRankedKeywordConnections(projectPublicId)).rejects.toMatchObject({
      code: "invalid_public_id",
    });
  });

  it.each([
    ["budget_exhausted", Object.assign(new Error("budget"), { name: "BudgetExhaustedError" })],
    ["needs_reauth", new ProviderAuthError("dataforseo")],
    ["unsupported_location", new DataForSeoUnsupportedLocationError()],
  ] as const)("maps %s outcomes", async (reason, error) => {
    if (reason === "budget_exhausted") mocks.assertBudget.mockRejectedValue(error);
    else mocks.fetchPage.mockRejectedValue(error);
    await expect(run()).resolves.toMatchObject({ ok: false, reason });
    expect(mocks.prisma.providerCostEntry.create).not.toHaveBeenCalled();
  });

  it("maps provider rate limits before the lookup", async () => {
    mocks.consumeLimit.mockResolvedValue({ resetAt: 123, success: false });
    await expect(run()).resolves.toEqual({ ok: false, reason: "rate_limited", resetAt: 123 });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });
});
