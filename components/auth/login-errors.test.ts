import { describe, expect, it } from "vitest";
import { type AuthErrorMessages, authErrorMessage } from "./login-errors";

const messages: AuthErrorMessages = {
  emailUnavailable: "Email delivery is not configured.",
  fallback: "Something went wrong. Try again.",
  methodUnavailable: "This sign-in method is not configured.",
  providerEmailUnavailable: "This sign-in provider did not return an email address.",
  providerEmailUnverified: "Verify your email address with this sign-in provider, then try again.",
  providerProfileUnavailable:
    "We could not retrieve your account from this sign-in provider. Try again.",
};

describe("authErrorMessage", () => {
  it.each([
    [{ code: "EMAIL_NOT_CONFIGURED" }],
    [{ message: "EMAIL_NOT_CONFIGURED" }],
    [{ body: { code: "EMAIL_NOT_CONFIGURED" } }],
  ])("maps a direct email configuration rejection", (error) => {
    expect(authErrorMessage(error, messages)).toBe(messages.emailUnavailable);
  });

  it.each([
    ["PROVIDER_NOT_FOUND", "methodUnavailable"],
    ["USER_EMAIL_NOT_FOUND", "providerEmailUnavailable"],
    ["EMAIL_NOT_VERIFIED", "providerEmailUnverified"],
    ["FAILED_TO_GET_USER_INFO", "providerProfileUnavailable"],
  ] as const)("maps known social sign-in code %s", (code, messageKey) => {
    expect(authErrorMessage({ code }, messages)).toBe(messages[messageKey]);
  });

  it("keeps unknown provider diagnostics out of the localized UI", () => {
    expect(authErrorMessage({ message: "provider outage details" }, messages)).toBe(
      messages.fallback,
    );
  });
});
