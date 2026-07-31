import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { encryptSecret } from "@/lib/providers/crypto";
import { clearProviderRateLimitState, ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import type { SerpProvider, SerpRankResult } from "@/lib/providers/types";
import { getCalculatorPrefill } from "@/lib/queries/cost-calculator";
import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExhaustedError } from "./budget";
import {
  loadSerpProviderChain,
  ProviderChainError,
  runCheckWithFallback,
  runKeywordCheckWithFallback,
} from "./fallback";
import { type RankCheckKeywordInput, RankCheckRunnerError } from "./runner";

// Country-level neutral handles, as the runner would hand the provider (design §2.3).
const US_LOCATION: SerpRankLocation = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};

const mocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  evaluateKeywordAlerts: vi.fn(() => Promise.resolve([])),
  notifyRankCheckCompleted: vi.fn(() => Promise.resolve()),
  requireReadableProject: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { count: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    keywordSchedule: { update: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), update: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { create: vi.fn(), findMany: vi.fn() },
    rankCheck: { create: vi.fn(), findFirst: vi.fn() },
    signal: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/alerts/evaluate", () => ({ evaluateKeywordAlerts: mocks.evaluateKeywordAlerts }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: mocks.notifyRankCheckCompleted,
}));
vi.mock("./budget", async () => {
  const actual = await vi.importActual<typeof import("./budget")>("./budget");
  return { ...actual, assertBudgetAvailable: mocks.assertBudgetAvailable };
});

const KEYWORD: RankCheckKeywordInput = {
  id: "keyword_1",
  text: "rank tracker",
  location: US_LOCATION,
  device: "desktop",
  domain: "example.com",
};

beforeEach(() => {
  resetRateLimitStateForTests();
  clearProviderRateLimitState();
  process.env.REDIS_URL = "";
  process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
  mocks.assertBudgetAvailable.mockResolvedValue({ capCents: 500, spentCents: 0 });
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  mocks.prisma.signal.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: "signal_1", ...data }),
  );
  mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.providerCostEntry.create.mockResolvedValue({ id: "cost_1" });
  mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
});

function provider(id: string, fetchRank: SerpProvider["fetchRank"]): SerpProvider {
  return { id, label: id, testConnection: vi.fn(), fetchRank };
}

function ranked(position: number): SerpRankResult {
  return {
    position,
    rankingUrl: `https://example.com/p${position}`,
    costCents: 0,
    checkedAt: new Date("2026-01-01T06:00:00.000Z"),
  };
}

describe("runCheckWithFallback", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the next provider when the primary fails", async () => {
    const callOrder: string[] = [];
    const primary = provider("primary", vi.fn().mockRejectedValue(new Error("network down")));
    const secondary = provider("secondary", vi.fn().mockResolvedValue(ranked(4)));
    const unused = provider("unused", vi.fn().mockResolvedValue(ranked(8)));
    const providers: Record<string, SerpProvider> = { primary, secondary, unused };

    const outcome = await runCheckWithFallback({
      keyword: KEYWORD,
      schedule: { frequency: "manual" },
      connections: [
        { provider: "primary", credentials: { apiKey: "a" } },
        { provider: "secondary", credentials: { apiKey: "b" } },
        { provider: "unused", credentials: { apiKey: "c" } },
      ],
      now: new Date("2026-01-01T06:00:00.000Z"),
      resolveProvider: (id) => {
        callOrder.push(id);
        return providers[id];
      },
    });

    expect(outcome.provider).toBe("secondary");
    expect(outcome.result.rankCheck.position).toBe(4);
    expect(outcome.attempts).toEqual([{ provider: "primary", message: "network down" }]);
    expect(callOrder).toEqual(["primary", "secondary"]);
    expect(secondary.fetchRank).toHaveBeenCalledTimes(1);
    expect(unused.fetchRank).not.toHaveBeenCalled();
  });

  it("does not fall through on errors outside the fallback code set", async () => {
    const secondary = provider("secondary", vi.fn().mockResolvedValue(ranked(4)));
    const resolveProvider = vi.fn((id: string) => {
      if (id === "primary") {
        throw new RankCheckRunnerError("keyword_not_found", "Unexpected keyword scope error.");
      }
      return secondary;
    });

    const promise = runCheckWithFallback({
      connections: [
        { provider: "primary", credentials: { apiKey: "a" } },
        { provider: "secondary", credentials: { apiKey: "b" } },
      ],
      keyword: KEYWORD,
      resolveProvider,
      schedule: { frequency: "manual" },
    });

    await expect(promise).rejects.toMatchObject({ code: "keyword_not_found" });
    expect(resolveProvider).toHaveBeenCalledTimes(1);
    expect(secondary.fetchRank).not.toHaveBeenCalled();
  });

  it("throws an aggregate ProviderChainError when every provider fails", async () => {
    const providers: Record<string, SerpProvider> = {
      primary: provider("primary", vi.fn().mockRejectedValue(new Error("quota exceeded"))),
      secondary: provider("secondary", vi.fn().mockRejectedValue(new Error("parse error"))),
    };

    const promise = runCheckWithFallback({
      keyword: KEYWORD,
      schedule: { frequency: "manual" },
      connections: [
        { provider: "primary", credentials: { apiKey: "a" } },
        { provider: "secondary", credentials: { apiKey: "b" } },
      ],
      resolveProvider: (id) => providers[id],
    });

    await expect(promise).rejects.toBeInstanceOf(ProviderChainError);
    await promise.catch((error: ProviderChainError) => {
      expect(error.attempts).toEqual([
        { provider: "primary", message: "quota exceeded" },
        { provider: "secondary", message: "parse error" },
      ]);
      expect(error.code).toBe("provider_failed");
      expect(error.message).toContain("quota exceeded");
      expect(error.message).toContain("parse error");
    });
  });

  it("throws a typed no-provider error for an empty chain", async () => {
    await expect(
      runCheckWithFallback({
        keyword: KEYWORD,
        schedule: { frequency: "manual" },
        connections: [],
      }),
    ).rejects.toMatchObject({ code: "no_provider_connected" });
  });

  it("advances the chain when the primary is rate-limited", async () => {
    const primary = provider(
      "primary",
      vi.fn().mockRejectedValue(new Error("HTTP 429 too many requests")),
    );
    const secondary = provider("secondary", vi.fn().mockResolvedValue(ranked(7)));
    const providers: Record<string, SerpProvider> = { primary, secondary };

    const outcome = await runCheckWithFallback({
      connections: [
        { provider: "primary", credentials: { apiKey: "a" } },
        { provider: "secondary", credentials: { apiKey: "b" } },
      ],
      keyword: KEYWORD,
      resolveProvider: (id) => providers[id],
      schedule: { frequency: "manual" },
    });

    expect(outcome.provider).toBe("secondary");
    expect(outcome.result.rankCheck.position).toBe(7);
    expect(outcome.attempts).toEqual([
      { message: "HTTP 429 too many requests", provider: "primary" },
    ]);
  });

  it("defers with ProviderRateLimitedError when every provider is rate-limited", async () => {
    const providers: Record<string, SerpProvider> = {
      primary: provider("primary", vi.fn().mockRejectedValue(new Error("429 rate limit reached"))),
      secondary: provider(
        "secondary",
        vi.fn().mockRejectedValue(new Error("too many requests, slow down")),
      ),
    };

    const promise = runCheckWithFallback({
      connections: [
        { provider: "primary", credentials: { apiKey: "a" } },
        { provider: "secondary", credentials: { apiKey: "b" } },
      ],
      keyword: KEYWORD,
      resolveProvider: (id) => providers[id],
      schedule: { frequency: "manual" },
    });

    await expect(promise).rejects.toBeInstanceOf(ProviderRateLimitedError);
    await expect(promise).rejects.not.toBeInstanceOf(ProviderChainError);
  });
});

describe("loadSerpProviderChain", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("orders the chain by priority and provider id", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { credentialsEncrypted: "ciphertext-1", id: "connection_1", provider: "dataforseo" },
      { credentialsEncrypted: "ciphertext-2", id: "connection_2", provider: "serpapi" },
    ]);

    const chain = await loadSerpProviderChain("project_1");

    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
    expect(chain).toEqual([
      {
        credentialsEncrypted: "ciphertext-1",
        provider: "dataforseo",
        rateContext: { entries: [], manualAmountCents: null },
      },
      {
        credentialsEncrypted: "ciphertext-2",
        provider: "serpapi",
        rateContext: { entries: [], manualAmountCents: null },
      },
    ]);
  });

  it("restricts a manual provider-specific chain to the requested provider", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 0.7,
        credentialsEncrypted: "ciphertext-serpapi",
        id: "connection_serpapi",
        provider: "serpapi",
      },
    ]);

    const chain = await loadSerpProviderChain("project_1", "serpapi");

    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        provider: "serpapi",
        status: "connected",
      },
    });
    expect(chain).toEqual([
      {
        costPerCheckCents: 0.7,
        credentialsEncrypted: "ciphertext-serpapi",
        provider: "serpapi",
        rateContext: { entries: [], manualAmountCents: null },
      },
    ]);
  });

  it("coalesces provider-rate queries across a concurrent keyword run", async () => {
    let resolveConnections:
      | ((connections: Array<{ id: string; provider: string }>) => void)
      | undefined;
    mocks.prisma.providerConnection.findMany.mockReturnValue(
      new Promise((resolve) => {
        resolveConnections = resolve;
      }),
    );

    const loads = Array.from({ length: 500 }, () => loadSerpProviderChain("project_1"));
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledTimes(1);

    resolveConnections?.([{ id: "connection_1", provider: "dataforseo" }]);
    await Promise.all(loads);

    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.providerConnectionRate.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("runKeywordCheckWithFallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("integrates a top-10 schedule with provider requests, persistence, budget, and top-100 calculator prefill", async () => {
    const fetchMock = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).includes("serpapi.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ organic_results: [{ link: "https://example.com", position: 4 }] }),
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            cost: 0.0006,
            status_code: 20000,
            tasks: [{ cost: 0.0006, result: [{ items: [] }], status_code: 20000 }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: null,
      project: {
        budgetCapCents: 500,
        defaults: { frequency: "daily", jitterMinutes: 0, serpDepth: 100 },
        domain: "example.com",
        id: "project_1",
        writeMode: "active",
      },
      projectId: "project_1",
      rankChecks: [],
      schedule: { frequency: "daily", jitterMinutes: 0, serpDepth: 10 },
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: null,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "serp-key" })),
        provider: "serpapi",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_serpapi" });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({
      keywordId: "keyword_1",
      resolveProvider: () => serpApiProvider,
    });

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("serpapi.com")),
    ).toHaveLength(1);
    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 500,
      excludeRankCheckId: undefined,
      estimatedCostCents: 1,
    });
    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estimatedCostCents: 1, requestedDepth: 10 }),
    });

    await dataForSeoProvider.fetchRank({
      credentials: { login: "login", password: "secret" },
      depth: 10,
      device: "desktop",
      domain: "example.com",
      keyword: "rank tracker",
      location: US_LOCATION,
    });
    const dataForSeoCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("dataforseo.com"),
    );
    expect(JSON.parse(String(dataForSeoCall?.[1]?.body))).toEqual([
      expect.objectContaining({ depth: 10 }),
    ]);

    mocks.requireReadableProject.mockResolvedValue({
      project: { id: "project_1", name: "Example" },
    });
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 1 }, device: "desktop", locationId: "loc_us" },
    ]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      serpDepth: 100,
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: null,
      provider: "serpapi",
    });

    await expect(getCalculatorPrefill("prj_a00000000000000000000000")).resolves.toMatchObject({
      depth: 100,
    });
  });

  it.each([
    {
      expectedDepth: 10,
      expectedStopOnMatch: false,
      label: "schedule override",
      projectDefaults: {
        frequency: "daily",
        jitterMinutes: 0,
        serpDepth: 50,
        serpStopOnMatch: false,
      },
      schedule: { frequency: "daily", jitterMinutes: 0, serpDepth: 10 },
    },
    {
      expectedDepth: 20,
      expectedStopOnMatch: true,
      label: "project default",
      projectDefaults: { frequency: "daily", jitterMinutes: 0, serpDepth: 20 },
      schedule: null,
    },
    {
      expectedDepth: 100,
      expectedStopOnMatch: true,
      label: "system default",
      projectDefaults: null,
      schedule: null,
    },
  ] as const)(
    "resolves depth from the $label",
    async ({ expectedDepth, expectedStopOnMatch, projectDefaults, schedule }) => {
      const fetchRank = vi.fn().mockResolvedValue(ranked(5));
      const primary = provider("primary", fetchRank);
      mocks.prisma.keyword.findUnique.mockResolvedValue({
        _count: { rankChecks: 2 },
        device: "desktop",
        id: "keyword_1",
        publicId: "kw_a00000000000000000000000",
        location: "United States",
        locationRef: null,
        project: { defaults: projectDefaults, domain: "example.com" },
        projectId: "project_1",
        rankChecks: [],
        schedule,
        text: "rank tracker",
      });
      mocks.prisma.providerConnection.findMany.mockResolvedValue([
        {
          credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
          provider: "primary",
        },
      ]);
      mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
      mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: "rank_1", ...data }),
      );

      await runKeywordCheckWithFallback({ keywordId: "keyword_1", resolveProvider: () => primary });

      expect(fetchRank).toHaveBeenCalledWith(
        expect.objectContaining({
          completedCheckCount: 2,
          depth: expectedDepth,
          stopOnMatch: expectedStopOnMatch,
        }),
      );
      expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ requestedDepth: expectedDepth }),
      });
    },
  );

  it("degrades to the default market when a null relation has an unsupported legacy string", async () => {
    const fetchRank = vi.fn().mockResolvedValue(ranked(5));
    const primary = provider("primary", fetchRank);
    // No joined Location row and a free-form legacy string the alias table does not
    // know: the runner must derive a country object synchronously and never throw.
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "Paris",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        provider: "primary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({
      keywordId: "keyword_1",
      resolveProvider: () => primary,
    });

    expect(fetchRank).toHaveBeenCalledWith(
      expect.objectContaining({
        location: expect.objectContaining({
          gl: "us",
          hl: "en",
          primaryGeoName: "United States",
          secondaryGeoName: "United States",
        }),
      }),
    );
  });

  it("derives the country object from a supported legacy string when the relation is null", async () => {
    const fetchRank = vi.fn().mockResolvedValue(ranked(5));
    const primary = provider("primary", fetchRank);
    // Dedup-loser / not-yet-migrated row: locationRef null but legacy string is a
    // known alias, so the runner maps it to the country seed (no DB/network).
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "Germany",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        provider: "primary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({ keywordId: "keyword_1", resolveProvider: () => primary });

    expect(fetchRank).toHaveBeenCalledWith(
      expect.objectContaining({
        location: expect.objectContaining({
          gl: "de",
          hl: "de",
          primaryGeoName: "Germany",
          secondaryGeoName: "Germany",
        }),
      }),
    );
  });

  it("builds the neutral object from a joined Location row without re-resolving", async () => {
    const fetchRank = vi.fn().mockResolvedValue(ranked(2));
    const primary = provider("primary", fetchRank);
    // A resolved city row: the runner projects its stored handles straight through.
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: {
        gl: "us",
        hl: "en",
        kind: "city",
        primaryGeoCode: 1026339,
        primaryGeoName: "Austin,Texas,United States",
        secondaryGeoName: "Austin, Texas, United States",
      },
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        provider: "primary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_primary" });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({ keywordId: "keyword_1", resolveProvider: () => primary });

    expect(fetchRank).toHaveBeenCalledWith(
      expect.objectContaining({
        location: {
          gl: "us",
          hl: "en",
          primaryGeoCode: 1026339,
          primaryGeoName: "Austin,Texas,United States",
          secondaryGeoName: "Austin, Texas, United States",
        },
      }),
    );
  });

  it("degrades a code-only city to the country handle for the code-based provider", async () => {
    // A city resolved only by name must degrade for a code-based provider lacking
    // its numeric handle.
    const fetchRank = vi.fn().mockResolvedValue(ranked(3));
    const codeBased = provider("dataforseo", fetchRank);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: {
        gl: "us",
        hl: "en",
        kind: "city",
        primaryGeoCode: null,
        primaryGeoName: "Austin, Texas, United States",
        secondaryGeoName: "Austin, Texas, United States",
      },
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ login: "u", password: "p" })),
        provider: "dataforseo",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_dfs" });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    await runKeywordCheckWithFallback({ keywordId: "keyword_1", resolveProvider: () => codeBased });

    // Degraded to the country name (reconstructed from gl) so the name fallback can
    // match; gl/hl are preserved as localization hints.
    const call = fetchRank.mock.calls[0][0];
    expect(call.location.primaryGeoCode).toBeNull();
    expect(call.location.primaryGeoName).toBe("United States");
    expect(call.location.secondaryGeoName).toBe("United States");
    expect(call.location.gl).toBe("us");
  });

  it("loads the enabled chain, persists the fallback winner, and keeps previous raw", async () => {
    const previousRaw = { competitors_above: [], serp_features: [] };
    const primary = provider("primary", vi.fn().mockRejectedValue(new Error("quota exceeded")));
    const secondary = provider("secondary", vi.fn().mockResolvedValue(ranked(4)));
    const providers: Record<string, SerpProvider> = { primary, secondary };
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      location: "United States",
      locationRef: null,
      project: { defaults: { frequency: "daily", jitterMinutes: 0 }, domain: "example.com" },
      projectId: "project_1",
      rankChecks: [{ position: 8, raw: previousRaw }],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        provider: "primary",
      },
      {
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "secondary-key" })),
        provider: "secondary",
      },
    ]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({ id: "connection_secondary" });
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      normalizationVersion: "v2",
      position: 8,
      rankingUrl: "https://example.com/old",
      raw: previousRaw,
      requestedDepth: 100,
    });
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", ...data }),
    );

    const outcome = await runKeywordCheckWithFallback({
      keywordId: "keyword_1",
      resolveProvider: (id) => providers[id],
    });

    expect(outcome.provider).toBe("secondary");
    expect(outcome.attempts).toEqual([{ message: "quota exceeded", provider: "primary" }]);
    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ position: 4, previousPosition: 8, provider: "secondary" }),
    });
    expect(mocks.evaluateKeywordAlerts).toHaveBeenCalledWith(
      "keyword_1",
      { position: 8, raw: previousRaw },
      expect.objectContaining({ rankCheckId: "rank_1" }),
      { comparisonAllowed: true, deliveryMode: "immediate" },
    );
    expect(mocks.prisma.rankCheck.findFirst).toHaveBeenCalledWith({
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      where: {
        keywordId: "keyword_1",
        normalizationVersion: "v2",
        requestedDepth: 100,
        status: "completed",
      },
    });
    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: { lastUsedAt: new Date("2026-01-01T06:00:00.000Z") },
      where: { id: "connection_secondary" },
    });
  });

  it("checks the budget with the primary connection cost estimate before provider execution", async () => {
    const primary = provider("primary", vi.fn().mockResolvedValue(ranked(4)));
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      location: "United States",
      locationRef: null,
      project: {
        budgetCapCents: 10,
        defaults: { frequency: "daily", jitterMinutes: 0 },
        domain: "example.com",
        id: "project_1",
        writeMode: "active",
      },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 0.75,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        provider: "primary",
      },
    ]);
    mocks.assertBudgetAvailable.mockRejectedValue(
      new BudgetExhaustedError({ capCents: 10, projectId: "project_1", spentCents: 9.5 }),
    );

    await expect(
      runKeywordCheckWithFallback({ keywordId: "keyword_1", resolveProvider: () => primary }),
    ).rejects.toMatchObject({ code: "budget_exhausted", status: 429 });

    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 10,
      excludeRankCheckId: undefined,
      estimatedCostCents: 0.75,
    });
    expect(primary.fetchRank).not.toHaveBeenCalled();
  });

  it("keeps five plan-priced SerpAPI zero reports on the list-rate budget gate", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      location: "United States",
      locationRef: null,
      project: {
        budgetCapCents: 500,
        defaults: { frequency: "daily", jitterMinutes: 0 },
        domain: "example.com",
        id: "project_1",
        writeMode: "active",
      },
      projectId: "project_1",
      rankChecks: [],
      schedule: { frequency: "daily", jitterMinutes: 0, serpDepth: 10 },
      text: "rank tracker",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: null,
        credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "primary-key" })),
        id: "connection_serpapi",
        provider: "serpapi",
      },
    ]);
    mocks.prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        cached: false,
        connectionId: "connection_serpapi",
        costCents: 0,
        createdAt: new Date(`2026-07-${String(20 + index).padStart(2, "0")}T00:00:00.000Z`),
        failed: false,
        feature: "rank_check",
        unitCostCents: null,
      })),
    );
    mocks.assertBudgetAvailable.mockRejectedValue(
      new BudgetExhaustedError({ capCents: 500, projectId: "project_1", spentCents: 499.95 }),
    );

    await expect(
      runKeywordCheckWithFallback({
        keywordId: "keyword_1",
        resolveProvider: () => serpApiProvider,
      }),
    ).rejects.toMatchObject({ code: "budget_exhausted", status: 429 });

    expect(mocks.assertBudgetAvailable).toHaveBeenCalledWith("project_1", expect.any(Date), {
      capCents: 500,
      excludeRankCheckId: undefined,
      estimatedCostCents: 1,
    });
    expect(mocks.prisma.providerCostEntry.create).not.toHaveBeenCalled();
  });

  it("does not call providers when the project is in migration hold", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      id: "keyword_1",
      location: "United States",
      project: {
        defaults: { frequency: "daily", jitterMinutes: 0 },
        domain: "example.com",
        id: "project_1",
        writeMode: "migration_hold",
      },
      projectId: "project_1",
      rankChecks: [],
      schedule: null,
      text: "rank tracker",
    });

    await expect(runKeywordCheckWithFallback({ keywordId: "keyword_1" })).rejects.toMatchObject({
      code: "project_read_only",
    });

    expect(mocks.prisma.providerConnection.findMany).not.toHaveBeenCalled();
    expect(mocks.assertBudgetAvailable).not.toHaveBeenCalled();
  });
});
