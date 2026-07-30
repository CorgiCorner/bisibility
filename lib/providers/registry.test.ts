import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAnalyticsProvider,
  getSerpProvider,
  localSequenceProviderEnabled,
  providerLogoDomain,
  tintFor,
} from "./registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider logo domains", () => {
  it.each([
    ["dataforseo", "dataforseo.com"],
    ["serpapi", "serpapi.com"],
    ["gsc", "google.com"],
    ["ga4", "google.com"],
    ["plausible", "plausible.io"],
  ])("maps %s to %s", (providerId, domain) => {
    expect(providerLogoDomain(providerId)).toBe(domain);
  });

  it("returns null for unknown providers", () => {
    expect(providerLogoDomain("unknown")).toBeNull();
  });
});

describe("provider tints", () => {
  it("maps analytics and SERP providers to their shared summary tint", () => {
    expect(tintFor("gsc")).toBe("blue");
    expect(tintFor("dataforseo")).toBe("accent");
    expect(tintFor("unknown")).toBe("accent");
  });
});

describe("local sequence provider gating", () => {
  it("is available only in non-production runtimes and stays off in tests by default", () => {
    expect(localSequenceProviderEnabled("development")).toBe(true);
    expect(localSequenceProviderEnabled(undefined)).toBe(true);
    expect(localSequenceProviderEnabled("test")).toBe(false);
    expect(localSequenceProviderEnabled("test", "1")).toBe(true);
    expect(localSequenceProviderEnabled("production", "1")).toBe(false);
  });

  it("registers the adapter in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const registry = await import("./registry");

    expect(registry.PROVIDER_CATALOG.map((provider) => provider.id)).toContain("local-sequence");
    expect(registry.getSerpProvider("local-sequence").id).toBe("local-sequence");
  });

  it("does not register the adapter in production even when explicitly requested", async () => {
    vi.stubEnv("BISIBILITY_DEV_SERP_PROVIDER", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const registry = await import("./registry");

    expect(registry.PROVIDER_CATALOG.map((provider) => provider.id)).not.toContain(
      "local-sequence",
    );
    expect(() => registry.getSerpProvider("local-sequence")).toThrow(
      "Unknown SERP provider: local-sequence",
    );
  });
});

describe("fake analytics provider", () => {
  it("returns deterministic top queries for fake Search Console", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");

    const provider = getAnalyticsProvider("gsc");
    if (!provider.fetchTopQueries) throw new Error("Expected top-query capability");

    await expect(provider.fetchTopQueries({}, { limit: 2 })).resolves.toEqual([
      { clicks: 42, impressions: 860, query: "rank tracker" },
      { clicks: 28, impressions: 520, query: "seo api" },
    ]);
  });

  it("returns deterministic top queries for fake Analytics 4", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");

    const provider = getAnalyticsProvider("ga4");
    if (!provider.fetchTopQueries) throw new Error("Expected top-query capability");

    await expect(provider.fetchTopQueries({}, { limit: 2 })).resolves.toEqual([
      { clicks: 34, query: "pricing" },
      { clicks: 21, query: "docs" },
    ]);
  });

  it("returns deterministic query and page stats for fake analytics sources", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");

    const provider = getAnalyticsProvider("plausible");
    if (!provider.fetchQueryStats || !provider.fetchPageStats) {
      throw new Error("Expected analytics enrichment capabilities");
    }

    await expect(
      provider.fetchQueryStats({}, { endDate: "2026-07-03", limit: 1, startDate: "2026-06-03" }),
    ).resolves.toEqual([
      { clicks: 42, ctr: 0.12, impressions: 350, position: 3.4, query: "rank tracker" },
    ]);
    await expect(
      provider.fetchPageStats({}, { endDate: "2026-07-03", limit: 1, startDate: "2026-06-03" }),
    ).resolves.toEqual([
      {
        bounceRate: 0.38,
        path: "/",
        scrollDepth: 71,
        sessions: 120,
        visitDurationSeconds: 84,
        visitors: 95,
      },
    ]);
  });
});

describe("backlinks provider capabilities", () => {
  it("exposes all backlinks methods through the neutral SERP interface", async () => {
    vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
    const provider = getSerpProvider("dataforseo");

    expect(provider.fetchBacklinksSummary).toBeTypeOf("function");
    expect(provider.fetchBacklinksHistory).toBeTypeOf("function");
    expect(provider.fetchBacklinksRows).toBeTypeOf("function");
    const firstPage = await provider.fetchBacklinksRows?.(
      {},
      {
        includeSubdomains: true,
        limit: 100,
        mode: "as_is",
        offset: 0,
        target: "example.com",
        targetScope: "site",
      },
    );
    const secondPage = await provider.fetchBacklinksRows?.(
      {},
      {
        includeSubdomains: true,
        limit: 100,
        mode: "as_is",
        offset: 100,
        target: "example.com",
        targetScope: "site",
      },
    );

    expect(firstPage).toMatchObject({ costCents: 0, totalCount: 220 });
    expect(firstPage?.rows).toHaveLength(100);
    expect(firstPage?.rows[0]?.sourceDomain).toBe("alpha.example");
    expect(secondPage?.rows).toHaveLength(100);
    expect(secondPage?.rows[50]?.sourceDomain).toBe("source-149.example");
  });
});
