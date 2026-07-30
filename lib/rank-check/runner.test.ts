import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { encryptSecret } from "@/lib/providers/crypto";
import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import type { SerpProvider } from "@/lib/providers/types";
import { serpRankLocationFromLegacy } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistFailedRankCheck, persistRankCheck, RankCheckRunnerError, runCheck } from "./runner";
import { computeNextCheckAt } from "./schedule";

const US_LOCATION = serpRankLocationFromLegacy("United States");
const mocks = vi.hoisted(() => ({
  evaluateKeywordAlerts: vi.fn(() => Promise.resolve([])),
  notifyRankCheckCompleted: vi.fn(() => Promise.resolve()),
  notifyRankCheckFailed: vi.fn(() => Promise.resolve()),
  prisma: {
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keywordSchedule: { update: vi.fn() },
    projectDefaults: { update: vi.fn() },
    providerConnection: { update: vi.fn() },
    rankCheck: { create: vi.fn() },
    signal: { create: vi.fn() },
  },
}));

vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateKeywordAlerts: mocks.evaluateKeywordAlerts,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: mocks.notifyRankCheckCompleted,
  notifyRankCheckFailed: mocks.notifyRankCheckFailed,
}));

function provider(fetchRank: SerpProvider["fetchRank"], id = "mock-serp"): SerpProvider {
  return { fetchRank, id, label: "Mock SERP", testConnection: vi.fn() };
}

describe("runCheck", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_PER_MINUTE = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches rank and stores the provider raw SERP payload", async () => {
    const now = new Date("2026-01-01T06:00:00.000Z");
    const raw = {
      organic_results: [
        { domain: "rankzly.io", rank: 1, title: "Rankzly", url: "https://rankzly.io/page" },
        {
          domain: "example.com",
          rank: 3,
          title: "Example",
          url: "https://example.com/ranking-page",
        },
        { domain: "other.dev", rank: 5, title: "Other", url: "https://other.dev/page" },
      ],
      serp_features: ["featured snippet", "people also ask"],
    };
    const serp = provider(
      vi.fn().mockResolvedValue({
        billingUnits: 4,
        checkedAt: new Date("2026-01-01T05:59:00.000Z"),
        costCents: 0.2,
        position: 3,
        rankingUrl: "https://example.com/ranking-page",
        raw,
      }),
      "dataforseo",
    );

    const result = await runCheck({
      completedCheckCount: 3,
      connection: { credentials: { login: "user", password: "pass" }, provider: "dataforseo" },
      depth: 20,
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      now,
      previousPosition: 8,
      provider: serp,
      schedule: { frequency: "daily", jitterMinutes: 0 },
    });

    expect(serp.fetchRank).toHaveBeenCalledWith({
      completedCheckCount: 3,
      credentials: { login: "user", password: "pass" },
      depth: 20,
      device: "desktop",
      domain: "example.com",
      keyword: "rank tracker",
      location: US_LOCATION,
      stopOnMatch: true,
    });
    expect(result.rankCheck).toMatchObject({
      billingUnits: 4,
      checkedAt: now,
      costCents: 0.2,
      estimatedCostCents: null,
      keywordId: "keyword_1",
      position: 3,
      previousPosition: 8,
      provider: "dataforseo",
      rankingUrl: "https://example.com/ranking-page",
      requestedDepth: 20,
    });
    expect(result.rankCheck.organicRanks).toEqual([
      { domain: "rankzly.io", position: 1 },
      { domain: "example.com", position: 3 },
      { domain: "other.dev", position: 5 },
    ]);
    expect(result.rankCheck.raw).toEqual(raw);
    expect(result.scheduleUpdate.nextCheckAt).toEqual(
      computeNextCheckAt({ frequency: "daily", jitterMinutes: 0 }, now, "keyword_1"),
    );
  });

  it("keeps delayed monthly retries on the persisted wall-clock anchor", async () => {
    const serp = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-02-15T07:30:00.000Z"),
        costCents: 0,
        position: 3,
        rankingUrl: "https://example.com/ranking-page",
      }),
    );

    const input = {
      connection: { credentials: { apiKey: "serp-key" }, provider: "serpapi" },
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      now: new Date("2026-02-15T07:30:00.000Z"),
      provider: serp,
      schedule: {
        frequency: "monthly",
        jitterMinutes: 120,
        nextCheckAt: new Date("2026-02-15T06:00:00.000Z"),
        timezone: "UTC",
      },
    } as const;
    const result = await runCheck(input);
    const retryResult = await runCheck({
      ...input,
      now: new Date("2026-02-15T08:45:00.000Z"),
    });

    expect(result.scheduleUpdate).toEqual({
      lastCheckedAt: new Date("2026-02-15T07:30:00.000Z"),
      nextCheckAt: new Date("2026-03-15T06:00:00.000Z"),
    });
    expect(retryResult.scheduleUpdate).toEqual({
      lastCheckedAt: new Date("2026-02-15T08:45:00.000Z"),
      nextCheckAt: new Date("2026-03-15T06:00:00.000Z"),
    });
  });

  it("passes a disabled stop-on-match setting to the provider", async () => {
    const serp = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: null,
        rankingUrl: null,
      }),
    );

    await runCheck({
      connection: { credentials: { apiKey: "serp-key" }, provider: "serpapi" },
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" },
      stopOnMatch: false,
    });

    expect(serp.fetchRank).toHaveBeenCalledWith(expect.objectContaining({ stopOnMatch: false }));
  });

  it("decrypts stored provider credentials before calling the provider", async () => {
    const serp = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: null,
        rankingUrl: null,
      }),
    );
    const credentialsEncrypted = encryptSecret(
      JSON.stringify({ login: "login", password: "secret" }),
    );

    await runCheck({
      connection: { credentialsEncrypted, provider: "dataforseo" },
      keyword: {
        device: "mobile",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" },
    });

    expect(serp.fetchRank).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { login: "login", password: "secret" },
        depth: 100,
      }),
    );
  });

  it("uses the configured connection cost when the provider reports zero cost", async () => {
    const serp = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 2,
        rankingUrl: "https://example.com/rank",
      }),
    );

    const result = await runCheck({
      connection: {
        costPerCheckCents: 0.75,
        credentials: { apiKey: "serp-key" },
        provider: "serpapi",
      },
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" },
    });

    expect(result.rankCheck.costCents).toBe(0.75);
    expect(result.rankCheck.estimatedCostCents).toBeNull();
  });

  it("keeps an explicit zero-cost connection free when the provider reports zero", async () => {
    const serp = provider(
      vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 2,
        rankingUrl: "https://example.com/rank",
      }),
      "dataforseo",
    );

    const result = await runCheck({
      connection: { costPerCheckCents: 0, credentials: {}, provider: "dataforseo" },
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" },
    });

    expect(result.rankCheck.costCents).toBe(0);
    expect(result.rankCheck.estimatedCostCents).toBe(0);
    expect(result.providerCostCents).toBeUndefined();
  });

  it.each([
    [10, 1],
    [100, 10],
  ] as const)(
    "estimates SerpAPI top-%i cost when neither provider nor connection reports a cost",
    async (depth, expectedCostCents) => {
      const serp = provider(
        vi.fn().mockResolvedValue({
          checkedAt: new Date("2026-01-01T06:00:00.000Z"),
          costCents: 0,
          position: 2,
          rankingUrl: "https://example.com/rank",
        }),
        "serpapi",
      );

      const result = await runCheck({
        connection: { credentials: { apiKey: "serp-key" }, provider: "serpapi" },
        depth,
        keyword: {
          device: "desktop",
          domain: "example.com",
          id: "keyword_1",
          location: US_LOCATION,
          text: "rank tracker",
        },
        provider: serp,
        schedule: { frequency: "manual" },
      });

      expect(result.rankCheck.costCents).toBe(0);
      expect(result.rankCheck.estimatedCostCents).toBe(expectedCostCents);
      expect(result.providerCostCents).toBeUndefined();
    },
  );

  it("consumes the provider budget before fetchRank and defers on exhaustion", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DATAFORSEO_PER_MINUTE = "1";
    const credentials = { login: "shared", password: "pw" };
    const serp: SerpProvider = {
      fetchRank: vi.fn().mockResolvedValue({
        checkedAt: new Date("2026-01-01T06:00:00.000Z"),
        costCents: 0,
        position: 1,
        rankingUrl: null,
      }),
      id: "dataforseo",
      label: "DataForSEO",
      testConnection: vi.fn(),
    };
    const args = {
      connection: { credentials, provider: "dataforseo" },
      keyword: {
        device: "desktop" as const,
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" as const },
    };

    await runCheck(args);
    expect(serp.fetchRank).toHaveBeenCalledTimes(1);

    const rejection = runCheck(args);
    await expect(rejection).rejects.toBeInstanceOf(RankCheckRunnerError);
    await rejection.catch((error: RankCheckRunnerError) => {
      expect(error.code).toBe("provider_rate_limited");
    });
    expect(serp.fetchRank).toHaveBeenCalledTimes(1);
  });

  it("classifies a provider 429 as a rate-limit deferral", async () => {
    const serp: SerpProvider = {
      fetchRank: vi.fn().mockRejectedValue(new Error("Request failed with HTTP 429.")),
      id: "dataforseo",
      label: "DataForSEO",
      testConnection: vi.fn(),
    };

    const rejection = runCheck({
      connection: { credentials: { login: "u", password: "p" }, provider: "dataforseo" },
      keyword: {
        device: "desktop",
        domain: "example.com",
        id: "keyword_1",
        location: US_LOCATION,
        text: "rank tracker",
      },
      provider: serp,
      schedule: { frequency: "manual" },
    });

    await expect(rejection).rejects.toMatchObject({ code: "provider_rate_limited" });
  });
});

describe("persistRankCheck", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.signal.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "signal_1", ...data }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stores raw SERP data and evaluates alerts with previous and current raw snapshots", async () => {
    const checkedAt = new Date("2026-01-01T06:00:00.000Z");
    const raw = {
      organic_results: [
        { domain: "rankzly.io", rank: 1, title: "Rankzly", url: "https://rankzly.io/page" },
      ],
      serp_features: ["featured snippet"],
    };
    const previousRaw = { organic_results: [], serp_features: [] };
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    const rankCheck = await persistRankCheck(
      {
        connectionId: "connection_1",
        hasDefaults: true,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: "kw_a00000000000000000000000",
        previousRaw,
        projectId: "project_1",
      },
      {
        rankCheck: {
          billingUnits: 4,
          checkedAt,
          costCents: 0,
          estimatedCostCents: 5,
          keywordId: "keyword_1",
          organicRanks: [{ domain: "rankzly.io", position: 1 }],
          position: 4,
          previousPosition: 8,
          provider: "serpapi",
          rankingUrl: "https://example.com/rank-tracker",
          raw,
          requestedDepth: 50,
        },
        scheduleUpdate: {
          lastCheckedAt: checkedAt,
          nextCheckAt: new Date("2026-01-02T06:00:00.000Z"),
        },
      },
    );

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingUnits: 4,
        estimatedCostCents: 5,
        organicRanks: [{ domain: "rankzly.io", position: 1 }],
        raw,
        requestedDepth: 50,
      }),
    });
    expect(mocks.evaluateKeywordAlerts).toHaveBeenCalledWith(
      "keyword_1",
      { position: 8, raw: previousRaw },
      expect.objectContaining({ position: 4, rankCheckId: "rank_1", raw }),
      { deliveryMode: "immediate" },
    );
    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: { lastUsedAt: checkedAt },
      where: { id: "connection_1" },
    });
    expect(mocks.prisma.projectDefaults.update).toHaveBeenCalledWith({
      data: { lastCheckedAt: checkedAt },
      where: { projectId: "project_1" },
    });
    expect(mocks.notifyRankCheckCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ rankCheckId: "rank_1" }),
    );
    expect(rankCheck.id).toBe("rank_1");
  });

  it("stores provider failures in status and error columns", async () => {
    const checkedAt = new Date("2026-01-01T06:00:00.000Z");
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_failed_1", ...data }),
    );

    const rankCheck = await persistFailedRankCheck({
      checkedAt,
      error: "provider unavailable",
      keywordId: "keyword_1",
      keywordPublicId: "kw_a00000000000000000000000",
      keywordText: "rank tracker",
      projectDomain: "example.com",
      projectId: "project_1",
      provider: "serpapi",
      requestedDepth: 20,
    });

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkedAt,
        error: "provider unavailable",
        keywordId: "keyword_1",
        raw: expect.any(Object),
        requestedDepth: 20,
        status: "failed",
      }),
    });
    expect(mocks.notifyRankCheckFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordPublicId: "kw_a00000000000000000000000",
        message: "provider unavailable",
      }),
    );
    expect(rankCheck.id).toBe("rank_failed_1");
  });
});
