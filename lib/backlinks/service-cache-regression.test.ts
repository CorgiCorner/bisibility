import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateBacklinksCache } from "./cache";
import { analyzeBacklinks } from "./service";

const fixtures = vi.hoisted(() => ({
  values: new Map<string, string>(),
  redis: { get: vi.fn(), set: vi.fn(), eval: vi.fn(), del: vi.fn() },
  prisma: {
    project: { findFirst: vi.fn() },
    backlinkSnapshot: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  provider: {
    id: "dataforseo",
    label: "Fixture",
    fetchBacklinksSummary: vi.fn(),
    fetchBacklinksHistory: vi.fn(),
    fetchBacklinksRows: vi.fn(),
  },
}));
vi.mock("@/lib/redis/redis", () => ({
  redisConfigured: () => true,
  getRedisClient: async () => fixtures.redis,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: fixtures.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: () => fixtures.provider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: ({ call }: { call: (credentials: object) => Promise<unknown> }) => call({}),
  preflightProviderBudget: async () => undefined,
}));
const summary = {
  backlinksTotal: 17,
  brokenBacklinks: 0,
  brokenPages: 0,
  dofollowPct: 50,
  domainRank: 20,
  lostBacklinks: 2,
  lostReferringDomains: 1,
  newBacklinks: 4,
  newReferringDomains: 2,
  referringDomainsTotal: 7,
  referringPages: 12,
  spamScore: 0,
};

describe("failed summary with real cache control flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.values.clear();
    fixtures.redis.del.mockImplementation(async (key: string) =>
      Number(fixtures.values.delete(key)),
    );
    fixtures.redis.get.mockImplementation(async (key: string) => fixtures.values.get(key) ?? null);
    fixtures.redis.set.mockImplementation(
      async (key: string, value: string, options: { NX?: boolean }) => {
        if (options.NX && fixtures.values.has(key)) return null;
        fixtures.values.set(key, value);
        return "OK";
      },
    );
    fixtures.redis.eval.mockImplementation(
      async (_script: string, input: { arguments: string[]; keys: string[] }) => {
        if (fixtures.values.get(input.keys[0]) === input.arguments[0])
          fixtures.values.delete(input.keys[0]);
        return 1;
      },
    );
    fixtures.prisma.project.findFirst.mockResolvedValue({
      id: "fixture_project",
      publicId: "prj_fixture",
      budgetCapCents: 5000,
      providerConnections: [
        { id: "fixture_connection", provider: "dataforseo", credentialsEncrypted: "fixture" },
      ],
    });
    fixtures.prisma.backlinkSnapshot.findFirst.mockResolvedValue(null);
    fixtures.provider.fetchBacklinksSummary.mockResolvedValue({ costCents: 2, summary });
    fixtures.provider.fetchBacklinksHistory.mockRejectedValue(
      new ProviderUsagePersistenceError({
        phase: "measurement",
        cause: new Error("DO_NOT_SERIALIZE_RAW_PROVIDER_CAUSE"),
      }),
    );
  });

  it("releases the lock without caching failed evidence across two explicit analyses", async () => {
    for (const invocation of [1, 2]) {
      const outcome = await analyzeBacklinks(
        { origin: APP_REQUEST_ORIGIN, projectId: "prj_fixture" },
        { target: "example.org", resultLimit: 100 },
      );
      expect(outcome).toMatchObject({
        ok: false,
        status: "failed",
        reason: "history_failed",
        costCents: null,
        knownSummaryCostCents: 2,
        summary,
        historyStatus: "failed",
        rowsStatus: "not_requested",
        historyFailure: { code: "provider_usage_unconfirmed", phase: "measurement" },
      });
      for (const successField of ["cached", "cachedUntil", "rows", "history"]) {
        expect(outcome).not.toHaveProperty(successField);
      }
      expect(JSON.stringify(outcome)).not.toContain("DO_NOT_SERIALIZE_RAW_PROVIDER_CAUSE");
      expect(fixtures.prisma.$transaction).not.toHaveBeenCalled();
      expect(fixtures.provider.fetchBacklinksRows).not.toHaveBeenCalled();
      expect(fixtures.redis.set.mock.calls.filter(([key]) => !key.endsWith(":lock"))).toEqual([]);
      expect(fixtures.values.size).toBe(0);
      expect(fixtures.redis.eval).toHaveBeenCalledTimes(invocation);
      expect(fixtures.provider.fetchBacklinksSummary).toHaveBeenCalledTimes(invocation);
      expect(fixtures.provider.fetchBacklinksHistory).toHaveBeenCalledTimes(invocation);
    }
  });
  it("fetches the larger requested sample after a smaller Redis sample was cached", async () => {
    fixtures.provider.fetchBacklinksHistory.mockResolvedValue({ costCents: 1, rows: [] });
    fixtures.provider.fetchBacklinksRows.mockImplementation(
      async (_credentials: unknown, input: { limit: number }) => ({
        costCents: 1,
        totalCount: 1000,
        rows: Array.from({ length: input.limit }, (_, index) => ({
          anchor: "link",
          domainAuthority: 1,
          firstSeen: null,
          flags: [],
          linksCount: 1,
          lostAt: null,
          sourceDomain: `s${index}.example.org`,
          sourceUrl: `https://s${index}.example.org/`,
          spamScore: 0,
          status: "active",
          targetUrl: "https://example.org/",
        })),
      }),
    );
    fixtures.prisma.$transaction.mockImplementation(
      async (
        work: (tx: {
          backlinkSnapshot: {
            create: (input: { data: Record<string, unknown> }) => Promise<unknown>;
          };
        }) => Promise<unknown>,
      ) =>
        work({
          backlinkSnapshot: {
            create: async ({ data }) => ({
              ...data,
              id: "snapshot-fixture",
              rows: (data.rows as { create: unknown[] }).create,
            }),
          },
        }),
    );
    const context = { origin: APP_REQUEST_ORIGIN, projectId: "prj_fixture" };
    const first = await analyzeBacklinks(context, { target: "example.org", resultLimit: 100 });
    const larger = await analyzeBacklinks(context, { target: "example.org", resultLimit: 1000 });
    expect(first).toMatchObject({ ok: true, fetchedRowCount: 100 });
    expect(larger).toMatchObject({ ok: true, fetchedRowCount: 1000, cached: false });
    expect(fixtures.provider.fetchBacklinksRows).toHaveBeenCalledTimes(2);
  });
  it("evicts every cached sample reference when its snapshot advances", async () => {
    const scope = {
      includeSubdomains: true,
      mode: "as_is" as const,
      projectId: "fixture_project",
      provider: "dataforseo",
      scope: "site" as const,
      target: "example.org",
    };
    for (const limit of [100, 300, 500, 1000])
      fixtures.values.set(
        `bl:v3:fixture_project:dataforseo:example.org:site:1:as_is:${limit}`,
        "old-reference",
      );
    await invalidateBacklinksCache(scope);
    expect(fixtures.values.size).toBe(0);
    expect(fixtures.redis.del).toHaveBeenCalledTimes(4);
  });
});
