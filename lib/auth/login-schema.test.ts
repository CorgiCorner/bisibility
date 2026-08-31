import { describe, expect, it } from "vitest";
import { emptyOtpDigits, loginSchema } from "./login-schema";

describe("loginSchema", () => {
  it("normalizes email casing for both OTP send and verification", () => {
    expect(
      loginSchema.parse({
        email: " Person@Example.COM ",
        otp: emptyOtpDigits(),
        verificationToken: undefined,
      }).email,
    ).toBe("person@example.com");
  });
});
