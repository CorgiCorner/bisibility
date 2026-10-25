import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleApiFetch } from "./google-client";
import { quotaPayload } from "./google-quota.test-support";

const context = { accountKey: "gsc:quota-details-test", providerId: "gsc" as const };

describe("Google quota propagation", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
  });
  afterEach(() => vi.unstubAllGlobals());

  // Malformed variants of the documented shape, not captured provider responses.
  it.each([{ details: { foo: 1 } }, { details: [null] }])(
    "keeps malformed details $details as a provider 429",
    async ({ details }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({ error: { details } }),
        }),
      );
      await expect(
        googleApiFetch("https://example.test/inspect", "token", {}, context),
      ).rejects.toMatchObject({
        name: "ProviderRateLimitedError",
        source: "provider",
        scope: "unknown",
        retryAfterMs: undefined,
      });
    },
  );

  it.each([
    ["RequestsPerMinutePerSite", "minute", "17s", 17_000],
    ["RequestsPerDayPerSite", "daily", "1.5s", 1_500],
    ["RequestsPerProject", "unknown", "invalid", undefined],
  ] as const)(
    "carries %s scope and delay on the thrown error",
    async (limit, scope, duration, retryAfterMs) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => quotaPayload(limit, duration),
        }),
      );
      await expect(
        googleApiFetch("https://example.test/inspect", "token", {}, context),
      ).rejects.toMatchObject({
        name: "ProviderRateLimitedError",
        source: "provider",
        scope,
        retryAfterMs,
      });
    },
  );
});
