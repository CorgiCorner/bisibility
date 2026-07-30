import { describe, expect, it } from "vitest";
import { isAllowedTwoFactorHttpRequest } from "./two-factor-route-guard";

describe("two-factor HTTP route guard", () => {
  it.each([
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/generate-backup-codes",
    "/two-factor/get-totp-uri",
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
  ])("default-denies the built-in management route %s", (path) => {
    expect(isAllowedTwoFactorHttpRequest(path, false)).toBe(false);
    expect(isAllowedTwoFactorHttpRequest(path, true)).toBe(false);
  });

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "allows %s only for a sign-in challenge without an active session",
    (path) => {
      expect(isAllowedTwoFactorHttpRequest(path, false)).toBe(true);
      expect(isAllowedTwoFactorHttpRequest(path, true)).toBe(false);
    },
  );
});
