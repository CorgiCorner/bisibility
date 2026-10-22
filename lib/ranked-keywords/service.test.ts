import { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import { testOwnAdmission } from "@/lib/provider-usage/byok-test-evidence";
import { byokTestJournal } from "@/lib/provider-usage/byok-test-journal";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { ProviderCredentials } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRankedKeywords, listEligibleRankedKeywordConnections } from "./service";

const projectPublicId = "prj_a00000000000000000000000";
const connectionPublicId = "conn_a00000000000000000000000";

const mocks = vi.hoisted(() => ({
  acquireLock: vi.fn(),
  evidenceRows: [] as Array<Record<string, unknown>>,
  consumeLimit: vi.fn(),
  fetchPage: vi.fn(),
  getProvider: vi.fn(),
  markReauth: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    providerConnection: { findUnique: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    meteringUsageEvidence: undefined as unknown as ReturnType<typeof byokTestJournal>["table"],
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
vi.mock("@/lib/providers/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/registry")>()),
  getSerpProvider: mocks.getProvider,
}));
vi.mock("@/lib/provider-usage/admission-extension", () => ({ ownAdmission: testOwnAdmission }));
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
  return fetchRankedKeywords({
    limit: 100,
    offset: 0,
    origin: APP_REQUEST_ORIGIN,
    projectId: projectPublicId,
    ...overrides,
  });
}

function observedPage(page: typeof cacheEntry) {
  return async (credentials: ProviderCredentials) => {
    const observer = credentials.usageObserver;
    if (!observer) throw new ProviderUsagePersistenceError();
    const id = await observer.begin({ attemptKey: crypto.randomUUID() });
    await observer.beforeDispatch?.(id);
    await observer.settle(id, {
      cached: false,
      failed: false,
      costCents: page.costCents,
      quantity: 1,
    });
    return page;
  };
}

describe("ranked-keyword service", () => {
  it("zero cap returns a cached page for free without admission", async () => {
    mocks.withCache.mockResolvedValue({ cached: true, status: "success", value: cacheEntry });
    await expect(run({ maxCostCents: 0 })).resolves.toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
      rows: [{ keyword: "rank tracker" }],
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(testOwnAdmission.reserve).not.toHaveBeenCalled();
    expect(mocks.evidenceRows).toHaveLength(0);
  });

  it("zero cap refuses a missing page with a price before admission", async () => {
    await expect(run({ maxCostCents: 0 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: expect.any(Number),
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(testOwnAdmission.reserve).not.toHaveBeenCalled();
    expect(mocks.evidenceRows).toHaveLength(0);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    testOwnAdmission.reserve
      .mockReset()
      .mockImplementation(async (_tx, inputs) =>
        inputs.map(({ id }) => ({ attemptId: id, leaseId: `lease:${id}` })),
      );
    const fixture = byokTestJournal("dataforseo");
    mocks.prisma.meteringUsageEvidence = fixture.table;
    mocks.prisma.$transaction.mockImplementation(fixture.db.$transaction);
    Object.defineProperty(mocks, "evidenceRows", { configurable: true, get: () => fixture.rows });
    mocks.fetchPage.mockReset();
    mocks.prisma.$queryRaw.mockReset();
    testOwnAdmission.acknowledge.mockClear();
    mocks.prisma.providerConnectionRate.findMany.mockReset();
    mocks.readCache.mockReset();
    mocks.releaseLock.mockReset();
    mocks.waitCache.mockReset();
    mocks.withCache.mockReset();
    mocks.writeCache.mockReset();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.project.findUnique.mockResolvedValue({ ownerId: "owner_1" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "own",
      credentialsEncrypted: "encrypted",
      enabled: true,
      status: "connected",
      project: { ownerId: "owner_1" },
      rates: [],
      projectId: project.id,
      provider: "dataforseo",
    });
    mocks.getProvider.mockReturnValue({
      id: "dataforseo",
      label: "DataForSEO",
      fetchRankedKeywords: mocks.fetchPage,
    });
    mocks.redisConfigured.mockReturnValue(true);
    mocks.acquireLock.mockResolvedValue({ key: "rk:key:lock", token: "token" });
    mocks.readCache.mockResolvedValue(null);
    mocks.waitCache.mockResolvedValue(null);

    mocks.consumeLimit.mockResolvedValue({ resetAt: Date.now() + 60_000, success: true });
    mocks.fetchPage.mockImplementation(observedPage(cacheEntry));
    mocks.prisma.$queryRaw.mockResolvedValue([]);

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
    expect(testOwnAdmission.reserve).not.toHaveBeenCalled();
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
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
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
  });

  it("checks the cache again after acquiring the lock to avoid duplicate spend", async () => {
    mocks.withCache.mockResolvedValue({ cached: true, status: "success", value: cacheEntry });

    await expect(run()).resolves.toMatchObject({ cached: true, ok: true });

    expect(mocks.withCache).toHaveBeenCalledOnce();
    expect(testOwnAdmission.reserve).not.toHaveBeenCalled();
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
    expect(mocks.evidenceRows).toEqual([
      expect.objectContaining({
        connectionId: "connection_1",
        projectId: "project_1",
        feature: "ranked_keywords",
        source: APP_REQUEST_ORIGIN.source,
        measurementStatus: "recorded",
        receipt: expect.objectContaining({
          costCents: "2.0000",
          quantity: "1.000000",
          cached: false,
          failed: false,
        }),
      }),
    ]);
    expect(testOwnAdmission.acknowledge).toHaveBeenCalledOnce();
  });

  it("threads the paying request origin through the paid call into retained Meter evidence", async () => {
    await expect(
      run({ origin: { credential: { id: "key_1", kind: "project_key" }, source: "mcp" } }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.evidenceRows).toEqual([
      expect.objectContaining({
        credentialId: "key_1",
        credentialKind: "project_key",
        source: "mcp",
      }),
    ]);
    expect(mocks.fetchPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attribution: expect.objectContaining({
          context: expect.objectContaining({ source: "mcp", trigger: "manual" }),
        }),
      }),
    );
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
    mocks.fetchPage.mockImplementation(observedPage({ ...cacheEntry, rows: [], totalCount: 100 }));
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

  it("uses the provider rate table for the retained Meter reservation estimate", async () => {
    await run();
    expect(mocks.evidenceRows).toEqual([
      expect.objectContaining({
        estimate: expect.objectContaining({ cents: "2.4000", units: "1" }),
      }),
    ]);
    expect(testOwnAdmission.reserve).toHaveBeenCalledOnce();
  });

  it("refuses the paid call when the page estimate exceeds max_cost_cents", async () => {
    await expect(run({ maxCostCents: 1 })).resolves.toEqual({
      estimatedCostCents: 2.4,
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
  });

  it("proceeds when the page estimate is within max_cost_cents", async () => {
    await expect(run({ maxCostCents: 2.4 })).resolves.toMatchObject({ ok: true });
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
  });

  it("never uses a cheap pooled feature average to pass the maximum cost guard", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        cached: false,
        failed: false,
        costCents: "0.001",
        unitCostCents: "0.001",
        feature: "ranked_keywords",
        createdAt: new Date("2026-10-10"),
      })),
    );
    await expect(run({ maxCostCents: 1 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: 2.4,
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(mocks.prisma.providerConnectionRate.findMany).not.toHaveBeenCalled();
  });

  it("zero cap refuses a cache miss even when its manual price is zero", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "own",
      credentialsEncrypted: "encrypted",
      projectId: project.id,
      provider: "dataforseo",
      project: { ownerId: "owner_1" },
      enabled: true,
      status: "connected",
      rates: [{ amountCents: "0" }],
    });
    await expect(run({ maxCostCents: 0 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: 0,
    });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
    expect(testOwnAdmission.reserve).not.toHaveBeenCalled();
    expect(mocks.evidenceRows).toEqual([]);
  });

  it("surfaces failed Meter evidence persistence instead of reporting unrecorded usage as success", async () => {
    mocks.prisma.meteringUsageEvidence.update.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const error = await run().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ProviderUsagePersistenceError);
    expect(error).toMatchObject({
      phase: "settlement",
      cause: expect.objectContaining({ message: "database unavailable" }),
    });
    expect(mocks.fetchPage).toHaveBeenCalledOnce();
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
    expect(mocks.evidenceRows).toEqual([expect.objectContaining({ measurementStatus: "unknown" })]);
  });

  it("refuses a successful billable transport result without retained accounting evidence", async () => {
    mocks.fetchPage.mockResolvedValue(cacheEntry);
    await expect(run()).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
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
    [
      "budget_exhausted",
      new BudgetExhaustedError({ projectId: "project_1", capCents: 5_000, spentCents: 5_000 }),
    ],
    ["needs_reauth", new ProviderAuthError("dataforseo")],
    ["unsupported_location", new DataForSeoUnsupportedLocationError()],
  ] as const)("maps %s outcomes", async (reason, error) => {
    if (reason === "budget_exhausted") testOwnAdmission.reserve.mockRejectedValue(error);
    else mocks.fetchPage.mockRejectedValue(error);
    await expect(run()).resolves.toMatchObject({ ok: false, reason });
    expect(testOwnAdmission.acknowledge).not.toHaveBeenCalled();
  });

  it("maps provider rate limits before the lookup", async () => {
    mocks.consumeLimit.mockResolvedValue({ resetAt: 123, success: false });
    await expect(run()).resolves.toEqual({ ok: false, reason: "rate_limited", resetAt: 123 });
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it("passes consent to admission and maps a price change to a cost-limit outcome", async () => {
    testOwnAdmission.reserve.mockRejectedValueOnce(new ProviderCostLimitError(4, 3));
    await expect(run({ maxCostCents: 3 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: 4,
    });
    expect(testOwnAdmission.reserve.mock.calls[0]?.[1][0]).toMatchObject({ maxCostCents: "3" });
    expect(mocks.evidenceRows).toHaveLength(0);
  });
});
