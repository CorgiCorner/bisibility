import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), redis: new Map<string, string>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/redis", () => ({
  redisConfigured: () => true,
  getRedisClient: async () => ({
    get: async (key: string) => mocks.redis.get(key) ?? null,
    set: async (key: string, value: string) => {
      mocks.redis.set(key, value);
      return "OK";
    },
    ttl: async () => 3600,
    eval: async () => 1,
  }),
}));
vi.mock("./context", () => ({
  requireDomainOverviewSource: async () => ({
    project: { id: "projectA", lookupCacheTtlSeconds: 3600 },
    source: { provider: { id: "dataforseo" } },
  }),
}));
vi.mock("./snapshot", () => ({
  findDomainOverviewSnapshot: async () => ({}),
  findDomainOverviewSnapshotMetadata: vi.fn(),
  persistDomainOverviewHistory: vi.fn(),
  persistDomainOverviewModules: vi.fn(),
  resolveDomainOverviewSnapshot: vi.fn(),
}));
vi.mock("./provider-call", () => ({
  assertDomainOverviewMaxCost: vi.fn(),
  domainOverviewCostReservation: vi.fn(),
  domainOverviewEstimate: () => ({ history: 1 }),
  fetchDomainHistory: mocks.fetch,
  fetchDomainKeywords: vi.fn(),
  fetchDomainPages: vi.fn(),
  preflightDomainOverview: vi.fn(),
}));

import { loadDomainOverviewHistory } from "./service";

const key = "do:v1:projectA:dataforseo:history:example.com:root:2840:en";
const load = () =>
  loadDomainOverviewHistory(
    { projectId: "projectA", origin: APP_REQUEST_ORIGIN },
    { target: "example.com", locationCode: 2840, languageCode: "en" },
  );
beforeEach(() => {
  mocks.redis.clear();
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({ costCents: 1, rows: [] });
});
it("loads history once and stamps fresh raw module values without an envelope", async () => {
  expect(await load()).toMatchObject({ ok: true, cached: false });
  const saved = JSON.parse(mocks.redis.get(key) ?? "null");
  expect(saved).toEqual({ costCents: 1, data: [], fetchedAt: expect.any(String) });
  expect(await load()).toMatchObject({ ok: true, cached: true, data: [], costCents: 0 });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
it("reuses legacy timestamp-less history without another paid call or rewriting its expiry", async () => {
  const raw = JSON.stringify({ costCents: 1, data: [] });
  mocks.redis.set(key, raw);
  expect(await load()).toEqual({ ok: true, cached: true, data: [], costCents: 0, fetchedAt: null });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.redis.get(key)).toBe(raw);
});
