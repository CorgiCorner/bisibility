import { ProviderCallError } from "@/lib/providers/call-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/cache", () => ({
  positiveTtl(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  },
  readProviderLookupCache: mocks.read,
  withProviderLookupCache: mocks.withCache,
}));
vi.mock("@/lib/provider-lookups/paid-call", () => ({
  ProviderLookupSignal: class ProviderLookupSignal extends Error {
    constructor(readonly outcome: { costCents?: number; ok: false; reason: string }) {
      super(outcome.reason);
    }
  },
}));

import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import {
  DEFAULT_TTL_SECONDS,
  domainOverviewCachedUntil,
  domainOverviewCacheKey,
  domainOverviewCacheTtlSeconds,
  domainOverviewFailure,
  loadDomainOverviewModule,
  readDomainOverviewCache,
  withDomainOverviewCache,
} from "./cache";

describe("domain overview cache", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("builds versioned market-aware keys with optional pagination", () => {
    const base = {
      languageCode: "en",
      locationCode: 2840,
      projectId: "project_1",
      provider: "dataforseo",
      scope: "subdomain" as const,
      target: "shop.example.com",
    };

    expect(domainOverviewCacheKey({ ...base, module: "overview" })).toBe(
      "do:v1:project_1:dataforseo:overview:shop.example.com:subdomain:2840:en",
    );
    expect(domainOverviewCacheKey({ ...base, limit: 100, module: "keywords", offset: 200 })).toBe(
      "do:v1:project_1:dataforseo:keywords:shop.example.com:subdomain:2840:en:100:200",
    );
  });

  it("uses a configurable positive 12 hour TTL", () => {
    expect(DEFAULT_TTL_SECONDS).toBe(43_200);
    vi.stubEnv("DOMAIN_OVERVIEW_CACHE_TTL_SECONDS", "");
    expect(domainOverviewCacheTtlSeconds()).toBe(43_200);
    vi.stubEnv("DOMAIN_OVERVIEW_CACHE_TTL_SECONDS", "900");
    expect(domainOverviewCacheTtlSeconds()).toBe(900);
    vi.stubEnv("DOMAIN_OVERVIEW_CACHE_TTL_SECONDS", "0");
    expect(domainOverviewCacheTtlSeconds()).toBe(43_200);
  });

  it("computes cached until from fetched at", () => {
    expect(domainOverviewCachedUntil("2026-08-11T10:00:00.000Z")).toBe("2026-08-11T22:00:00.000Z");
  });

  it("delegates reads and writes with the configured TTL", async () => {
    const load = vi.fn().mockResolvedValue({ value: true });
    mocks.read.mockResolvedValue({ cached: true });
    mocks.withCache.mockResolvedValue({ cached: false, status: "success", value: true });

    await expect(readDomainOverviewCache("cache-key")).resolves.toEqual({ cached: true });
    await expect(withDomainOverviewCache({ fresh: true, key: "cache-key", load })).resolves.toEqual(
      { cached: false, status: "success", value: true },
    );
    expect(mocks.read).toHaveBeenCalledWith("cache-key");
    expect(mocks.withCache).toHaveBeenCalledWith({
      fresh: true,
      key: "cache-key",
      load,
      ttlSeconds: 43_200,
    });
  });

  it("returns cached module data without charging its stored cost", async () => {
    mocks.withCache.mockResolvedValue({
      cached: true,
      status: "success",
      value: { costCents: 12, data: ["row"], fetchedAt: "2026-08-11T10:00:00.000Z" },
    });

    await expect(loadDomainOverviewModule({ key: "cache-key", load: vi.fn() })).resolves.toEqual({
      cached: true,
      costCents: 0,
      data: ["row"],
      fetchedAt: "2026-08-11T10:00:00.000Z",
      ok: true,
    });
  });

  it("runs the cost guard only when the cache loader is about to execute", async () => {
    const beforeLoad = vi.fn();
    const load = vi.fn().mockResolvedValue({ costCents: 2, data: ["row"] });
    mocks.withCache.mockImplementation(async ({ load: cacheLoad }) => ({
      cached: false,
      status: "success",
      value: await cacheLoad(),
    }));

    await expect(
      loadDomainOverviewModule({ beforeLoad, key: "cache-key", load }),
    ).resolves.toMatchObject({ costCents: 2, ok: true });
    expect(beforeLoad).toHaveBeenCalledOnce();
    expect(beforeLoad.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
  });

  it("maps contention and lookup failures to module outcomes", async () => {
    mocks.withCache.mockResolvedValueOnce({ resetAt: 1234, status: "contended" });
    await expect(loadDomainOverviewModule({ key: "cache-key", load: vi.fn() })).resolves.toEqual({
      costCents: 0,
      ok: false,
      reason: "in_progress",
      resetAt: 1234,
    });

    const signal = new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" });
    expect(domainOverviewFailure(signal)).toEqual({
      costCents: 0,
      ok: false,
      reason: "budget_exhausted",
    });
    expect(domainOverviewFailure(new Error("offline"))).toEqual({
      costCents: 0,
      ok: false,
      reason: "lookup_failed",
    });
    expect(domainOverviewFailure(new ProviderCallError("charged", 7))).toEqual({
      costCents: 7,
      ok: false,
      reason: "lookup_failed",
    });
  });
});
