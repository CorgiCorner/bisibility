import { afterEach, describe, expect, it, vi } from "vitest";
import { actionPaymentCache, notApplicablePaymentCache } from "./quote-cache";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const child = (cached: boolean, freeUntil?: string) => ({ cached, freeUntil });

describe("action payment cache window", () => {
  it("keeps a hit free until the earliest cached child and omits the window", () => {
    expect(
      actionPaymentCache({
        children: [
          child(true, "2026-10-22T12:00:00.000Z"),
          child(true, "2026-10-22T06:00:00.000Z"),
        ],
        feature: "keyword_research",
        lookupCacheTtlSeconds: 2_592_000,
      }),
    ).toEqual({
      state: "hit",
      freeUntil: "2026-10-22T06:00:00.000Z",
      windowSeconds: null,
    });
  });

  it("carries the effective window for a miss and a mixed quote", () => {
    vi.stubEnv("BACKLINKS_CACHE_TTL_SECONDS", "");
    expect(
      actionPaymentCache({
        children: [child(false)],
        feature: "backlinks",
        lookupCacheTtlSeconds: null,
      }).windowSeconds,
    ).toBe(86_400);
    expect(
      actionPaymentCache({
        children: [child(true, "2026-10-22T06:00:00.000Z"), child(false)],
        feature: "keyword_research",
        lookupCacheTtlSeconds: 2_592_000,
      }),
    ).toEqual({ state: "mixed", freeUntil: null, windowSeconds: 2_592_000 });
  });

  it("leaves rank checks and inapplicable quotes without a lookup window", () => {
    expect(
      actionPaymentCache({
        children: [child(false)],
        feature: "rank_check",
        lookupCacheTtlSeconds: 2_592_000,
      }),
    ).toEqual({ state: "miss", freeUntil: null, windowSeconds: null });
    expect(notApplicablePaymentCache()).toEqual({
      state: "not_applicable",
      freeUntil: null,
      windowSeconds: null,
    });
  });
});
