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
        scope: "site",
        target: "acme-store.com",
      }),
    ).toBe("bl:v1:project_1:acme-store.com:site:1:one_per_domain");
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
