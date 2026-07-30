import { describe, expect, it } from "vitest";
import { demoEmailOtpRateLimit } from "./demo-email-otp";

describe("demoEmailOtpRateLimit", () => {
  it("allows the validation login volume only for acknowledged demo mode", () => {
    expect(demoEmailOtpRateLimit(true, true)).toEqual({ max: 30, window: 60 });
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])("keeps the plugin default when enabled=%s and acknowledged=%s", (enabled, acknowledged) => {
    expect(demoEmailOtpRateLimit(enabled, acknowledged)).toBeUndefined();
  });
});
