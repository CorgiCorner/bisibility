import { parseRetryAfterSeconds } from "@/lib/http/retry-after";
import { describe, expect, it } from "vitest";
import { rateLimitedFailure } from "./delivery-failures";

describe("rate-limited delivery failures", () => {
  it.each([null, 0])("defaults non-positive or missing delays to 60 seconds", (delay) => {
    const failure = rateLimitedFailure("Rate limited.", delay);

    expect(String(failure.nextRetryDelay)).toContain("60");
  });

  it("caps a large Retry-After delta at 600 seconds", () => {
    const delay = parseRetryAfterSeconds("999999");
    const failure = rateLimitedFailure("Rate limited.", delay);

    expect(String(failure.nextRetryDelay)).toContain("600");
  });
});
