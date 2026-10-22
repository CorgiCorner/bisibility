import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
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
  supportsResearchScope: vi.fn(),
  wait: vi.fn(),
  write: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerConnection: {
      findUnique: vi.fn(async () => ({
        credentialSource: "own",
        credentialsEncrypted: "secret",
        projectId: "project_1",
        provider: "dataforseo",
        enabled: true,
        status: "connected",
        rates: [],
        project: { ownerId: "owner_1" },
      })),
    },
    $queryRaw: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: () => Promise.resolve({ entries: [], manualAmountCents: null }),
}));
vi.mock("@/lib/provider-lookups/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/cache")>()),
  acquireProviderLookupLock: mocks.acquire,
  providerLookupCacheConfigured: () => true,
  providerLookupContentionResetAt: mocks.resetAt,
  readProviderLookupCache: mocks.read,
  releaseProviderLookupLock: mocks.release,
  waitForProviderLookupCache: mocks.wait,
}));
vi.mock("./cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cache")>()),
  keywordMetricsCacheKey: ({ keyword }: { keyword: string }) => `km:${keyword}`,
  writeKeywordMetricsCache: mocks.write,
}));
vi.mock("@/lib/serp/research-capability", () => ({
  researchProviderRankLocation: (location: unknown) => location,
  researchScopeForLocation: (location: unknown) => location,
  supportsResearchScope: mocks.supportsResearchScope,
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
    origin: APP_REQUEST_ORIGIN,
    projectId: "project_1",
    ...overrides,
  });
}

describe("keyword metrics service", () => {
  it("zero cap returns cached metrics for free without paid work", async () => {
    mocks.read.mockResolvedValue({
      ...metrics,
      keyword: "Alpha",
      fetchedAt: "2026-10-11T10:00:00.000Z",
    });
    await expect(run({ maxCostCents: 0 })).resolves.toMatchObject({
      ok: true,
      cachedCount: 2,
      fetchedCount: 0,
      costCents: 0,
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("zero cap refuses missing metrics with a price before paid work", async () => {
    mocks.read.mockResolvedValue(null);
    await expect(run({ maxCostCents: 0 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      estimatedCostCents: expect.any(Number),
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("carries consent into admission and retains an earlier paid retry cost on refusal", async () => {
    mocks.read.mockResolvedValue(null);
    mocks.paidCall.mockRejectedValueOnce(
      new ProviderLookupSignal({
        ok: false,
        reason: "cost_limit_exceeded",
        estimatedCostCents: 3,
        costCents: 0.5,
      }),
    );
    await expect(run({ maxCostCents: 2 })).resolves.toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
      costCents: 0.5,
    });
    expect(mocks.paidCall).toHaveBeenCalledWith(expect.objectContaining({ maxCostCents: 2 }));
  });
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    vi.clearAllMocks();
    mocks.project.mockResolvedValue(project);
    mocks.acquire.mockResolvedValue({ key: "lock", token: "token" });
    mocks.release.mockResolvedValue(undefined);
    mocks.resetAt.mockResolvedValue(123_456);
    mocks.wait.mockResolvedValue(null);
    mocks.write.mockResolvedValue(true);
    mocks.supportsResearchScope.mockReturnValue(true);
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
      estimatedCostCents: 1.212,
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
    mocks.supportsResearchScope.mockReturnValue(false);

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

  it("threads the paying request origin into the metrics paid call", async () => {
    const origin = {
      credential: { id: "key_1", kind: "personal_token" as const },
      source: "mcp" as const,
    };
    mocks.read.mockResolvedValue(null);

    await expect(run({ origin })).resolves.toMatchObject({ ok: true });
    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { id: "key_1", kind: "personal_token" },
        source: "mcp",
        trigger: "manual",
      }),
    );
  });
});

describe("metrics payable failure receipts", () => {
  it("returns unknown retained payment on provider failure instead of reporting free", async () => {
    const pricing = vi
      .spyOn(
        await import("@/lib/provider-lookups/connection-estimate"),
        "requiredConnectionEstimate",
      )
      .mockResolvedValue(2);
    const selected = project.eligible[0];
    mocks.project.mockResolvedValue({
      ...project,
      ownerId: "owner_1",
      eligible: [
        {
          connection: { ...selected.connection, credentialSource: "own" },
          provider: {
            ...provider,
            payment: { basis: "provider_cost", unit: { kind: "currency", code: "USD" } },
          },
        },
      ],
    });
    mocks.supportsResearchScope.mockReturnValue(true);
    mocks.read.mockResolvedValue(null);
    mocks.acquire.mockResolvedValue({ key: "lock", token: "token" });
    mocks.paidCall.mockImplementationOnce(async ({ payment }) => {
      await payment.record({ attemptIds: ["possibly-paid-proof"] });
      throw new Error("provider failed after dispatch");
    });
    const result = await run({ actorId: "owner_1" });
    expect(result).toMatchObject({
      ok: false,
      reason: "provider_error",
      payment: { state: "unknown", charge: { value: null, certainty: "unknown" } },
    });
    pricing.mockRestore();
  });
});

describe("accepted metrics cache transitions", () => {
  it("executes only the remaining fresh subset and retains its actual charge", async () => {
    vi.clearAllMocks();
    const pricing = vi
      .spyOn(
        await import("@/lib/provider-lookups/connection-estimate"),
        "requiredConnectionEstimate",
      )
      .mockImplementation(async ({ itemCount }) => itemCount * 2);
    const selected = project.eligible[0];
    mocks.project.mockResolvedValue({
      ...project,
      ownerId: "owner_1",
      eligible: [
        {
          connection: { ...selected.connection, credentialSource: "own" },
          provider: {
            ...provider,
            payment: { basis: "provider_cost", unit: { kind: "currency", code: "USD" } },
          },
        },
      ],
    });
    mocks.supportsResearchScope.mockReturnValue(true);
    mocks.read.mockResolvedValue(null);
    const preview = await run({ actorId: "owner_1", estimateOnly: true, requirePayment: true });
    if (
      !preview.ok ||
      !("payment" in preview) ||
      !preview.payment ||
      !("quoteToken" in preview.payment)
    )
      throw new Error("quote missing");
    expect(preview.payment.charge.value).toBe("0.04");
    mocks.read.mockImplementation(async (key: string) =>
      key === "km:alpha"
        ? { keyword: "Alpha", fetchedAt: "2026-10-21T12:00:00Z", ...metrics }
        : null,
    );
    mocks.acquire.mockResolvedValue({ key: "lock", token: "token" });
    mocks.fetch.mockResolvedValue({ costCents: 2, rows: [{ keyword: "Beta", ...metrics }] });
    mocks.paidCall.mockImplementationOnce(async ({ call, payment }) => {
      const result = await call({});
      await payment.record({ attemptIds: ["retained-subset-attempt"] });
      return result;
    });
    const evidence = vi
      .spyOn(await import("@/lib/provider-usage/byok-evidence-storage"), "loadByokEvidence")
      .mockResolvedValue({
        measurementStatus: "recorded",
        costMeasurement: "recorded",
        quantityMeasurement: "recorded",
        costCents: "2",
        usageQuantity: "1",
      } as never);
    const result = await run({
      actorId: "owner_1",
      requirePayment: true,
      acceptedPayment: { quoteToken: preview.payment.quoteToken },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      fetchedCount: 1,
      cachedCount: 1,
      payment: { state: "settled", charge: { value: "0.02", certainty: "measured" } },
    });
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
      {},
      expect.objectContaining({ keywords: ["Beta"] }),
    );
    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
        itemCount: 1,
        payment: expect.objectContaining({ operationKey: expect.any(String) }),
      }),
    );
    pricing.mockRestore();
    evidence.mockRestore();
  });
});
