import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backlinksCachedUntil,
  backlinksCacheKey,
  backlinksCacheTtlSeconds,
  DEFAULT_TTL_SECONDS,
} from "./cache";

describe("backlinks cache", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the frozen versioned key", () => {
    expect(
      backlinksCacheKey({
        includeSubdomains: true,
        mode: "one_per_domain",
        projectId: "project_1",
        provider: "dataforseo",
        scope: "site",
        target: "example.com",
      }),
    ).toBe("bl:v3:project_1:dataforseo:example.com:site:1:one_per_domain:100");
  });

  it("uses a configurable positive 24 hour TTL", () => {
    expect(DEFAULT_TTL_SECONDS).toBe(86_400);
    vi.stubEnv("BACKLINKS_CACHE_TTL_SECONDS", "");
    expect(backlinksCacheTtlSeconds()).toBe(86_400);
    vi.stubEnv("BACKLINKS_CACHE_TTL_SECONDS", "600");
    expect(backlinksCacheTtlSeconds()).toBe(600);
    vi.stubEnv("BACKLINKS_CACHE_TTL_SECONDS", "0");
    expect(backlinksCacheTtlSeconds()).toBe(86_400);
  });

  it("computes cached until from fetched at", () => {
    expect(backlinksCachedUntil("2026-07-24T10:00:00.000Z")).toBe("2026-07-25T10:00:00.000Z");
  });
});

it("does not reuse a smaller row sample for a larger requested limit", () => {
  const scope = {
    includeSubdomains: true,
    mode: "as_is" as const,
    projectId: "p",
    provider: "dataforseo",
    scope: "site" as const,
    target: "example.com",
  };
  expect(backlinksCacheKey({ ...scope, resultLimit: 100 })).not.toBe(
    backlinksCacheKey({ ...scope, resultLimit: 1000 }),
  );
});
