import { EmailSendError } from "@/lib/email/types";
import { parseRetryAfterSeconds } from "@/lib/http/retry-after";
import { describe, expect, it } from "vitest";
import {
  classifyDeliveryFailure,
  permanentHttpStatus,
  rateLimitedFailure,
} from "./delivery-failures";

describe("rate-limited delivery failures", () => {
  it.each([null, 0])("defaults non-positive or missing delays to 60 seconds", (delay) => {
    const failure = rateLimitedFailure("Rate limited.", delay);

    expect(String(failure.nextRetryDelay)).toContain("60");
  });

  it("keeps a Resend payload mismatch permanent and a concurrent conflict retryable", () => {
    expect(permanentHttpStatus(409, "invalid_idempotent_request")).toBe(true);
    expect(permanentHttpStatus(409, "concurrent_idempotent_requests")).toBe(false);
    expect(permanentHttpStatus(409, null)).toBe(true);
    const mismatch = new EmailSendError("Resend send failed with status 409.", 409, null, {
      providerCode: "invalid_idempotent_request",
    });
    const concurrent = new EmailSendError("Resend send failed with status 409.", 409, null, {
      providerCode: "concurrent_idempotent_requests",
    });
    expect(classifyDeliveryFailure(mismatch, "email")).toMatchObject({ nonRetryable: true });
    expect(classifyDeliveryFailure(concurrent, "email")).toBe(concurrent);
  });

  it("caps a large Retry-After delta at 600 seconds", () => {
    const delay = parseRetryAfterSeconds("999999");
    const failure = rateLimitedFailure("Rate limited.", delay);

    expect(String(failure.nextRetryDelay)).toContain("600");
  });
});
