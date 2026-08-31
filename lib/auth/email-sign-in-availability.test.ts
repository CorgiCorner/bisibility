import { describe, expect, it } from "vitest";
import { isEmailSignInUnavailable } from "./email-sign-in-availability";

describe("isEmailSignInUnavailable", () => {
  it("requires a mailer for established production instances without fixed OTP", () => {
    expect(
      isEmailSignInUnavailable({
        firstRun: false,
        fixedOtpEnabled: false,
        isEmailConfigured: false,
        production: true,
      }),
    ).toBe(true);
  });

  it.each([
    [true, false, false, true],
    [false, false, true, true],
    [false, true, false, true],
    [false, false, false, false],
  ] as const)(
    "stays available when firstRun=%s fixedOtp=%s mailer=%s production=%s",
    (firstRun, fixedOtpEnabled, isEmailConfigured, production) => {
      expect(
        isEmailSignInUnavailable({
          firstRun,
          fixedOtpEnabled,
          isEmailConfigured,
          production,
        }),
      ).toBe(false);
    },
  );
});
