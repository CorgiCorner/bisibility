import { describe, expect, it } from "vitest";
import { googleRateLimitScope, googleRetryAfterMs } from "./google-quota";
import { quotaPayload } from "./google-quota.test-support";

describe("Google quota details", () => {
  it.each([
    ["UrlInspectionRequestsPerMinutePerSite", "minute"],
    ["UrlInspectionRequestsPerDayPerSite", "daily"],
    ["RequestsPerProject", "unknown"],
  ] as const)("classifies %s before the legacy reason", (limit, scope) => {
    expect(googleRateLimitScope(quotaPayload(limit))).toBe(scope);
  });

  it("reads a period from the metric when the limit has none", () => {
    const payload = quotaPayload("RequestsPerProject");
    const metadata = payload.error.details[0].metadata;
    if (!metadata) throw new Error("Expected quota metadata fixture");
    metadata.quota_metric = "example.googleapis.com/requests_per_day";
    expect(googleRateLimitScope(payload)).toBe("daily");
  });

  it.each(["reason", "status"] as const)(
    "honours legacy daily %s when quota names have no recognised period",
    (signal) => {
      const payload = quotaPayload("UrlInspectionRequestsPerSite");
      if (signal === "reason") payload.error.errors[0].reason = "dailyLimitExceeded";
      else payload.error.status = "dailyLimitExceeded";
      expect(googleRateLimitScope(payload)).toBe("daily");
    },
  );

  // Malformed variants of the documented shape, not captured provider responses.
  it.each(
    [{ foo: 1 }, [null], [false, "invalid", 1], [{ metadata: "invalid" }]].map((details) => ({
      details,
    })),
  )("ignores malformed details $details and legacy errors", ({ details }) => {
    const payload = { error: { details, errors: { foo: 1 } } };
    expect(googleRetryAfterMs(payload)).toBeUndefined();
    expect(googleRateLimitScope(payload)).toBe("unknown");
    expect(googleRateLimitScope({ error: { details, errors: [null, false] } })).toBe("unknown");
  });

  it.each([
    // Documented shape, not captured: legacy reasons with no structured details.
    [{ error: { errors: [{ reason: "dailyLimitExceeded" }] } }, "daily"],
    // Documented shape, not captured.
    [{ error: { errors: [{ reason: "rateLimitExceeded" }] } }, "minute"],
    // Documented shape, not captured.
    [{ error: { status: "RESOURCE_EXHAUSTED" } }, "unknown"],
    // Documented shape, not captured.
    [{ error: { status: "minute" } }, "minute"],
    [null, "unknown"],
  ] as const)("keeps legacy fallback for %j", (payload, scope) => {
    expect(googleRateLimitScope(payload)).toBe(scope);
  });

  it.each([
    ["17s", 17_000],
    ["1.5s", 1_500],
    ["0.000000001s", 1],
    ["0s", 0],
    ["-1s", undefined],
    ["Infinitys", undefined],
    ["1e3s", undefined],
    ["17", undefined],
    ["1.1234567890s", undefined],
  ])("parses retry duration %s", (delay, expected) => {
    expect(googleRetryAfterMs(quotaPayload("RequestsPerMinute", delay))).toBe(expected);
  });
});
