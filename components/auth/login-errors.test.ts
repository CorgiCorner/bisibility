import { describe, expect, it } from "vitest";
import { type AuthErrorMessages, authErrorMessage, isSessionCreationBlocked } from "./login-errors";

const messages: AuthErrorMessages = {
  accountInactive:
    "Your account is inactive. Contact the instance administrator to restore access.",
  sessionBlocked:
    "Sign-in is blocked for this account. Contact the instance administrator for help.",
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
    ["ACCOUNT_DEACTIVATED", "accountInactive"],
    ["SESSION_CREATION_BLOCKED", "sessionBlocked"],
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

describe("isSessionCreationBlocked", () => {
  it.each([
    { code: "ACCOUNT_DEACTIVATED" },
    { body: { code: "ACCOUNT_DEACTIVATED" } },
    { code: "session_creation_blocked" },
  ])("recognizes a blocked session after identity verification", (error) => {
    expect(isSessionCreationBlocked(error)).toBe(true);
  });

  it.each([null, { code: "INVALID_OTP" }, { message: "provider outage details" }])(
    "does not turn unrelated failures into account-state messages",
    (error) => expect(isSessionCreationBlocked(error)).toBe(false),
  );
});
