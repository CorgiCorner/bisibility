import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteSessionCookie: vi.fn(),
  generateRandomString: vi.fn(() => "pendingidentifier1234"),
}));

vi.mock("better-auth/cookies", () => ({
  deleteSessionCookie: mocks.deleteSessionCookie,
}));
vi.mock("better-auth/crypto", () => ({
  generateRandomString: mocks.generateRandomString,
}));

import {
  emailOtpTwoFactorPlugin,
  enforceEmailOtpTwoFactor,
  enforceSocialOAuthTwoFactor,
  socialOAuthTwoFactorLocation,
  socialOAuthTwoFactorPlugin,
} from "./email-otp-two-factor";

function bridgeContext(
  twoFactorEnabled: boolean,
  location = "/oauth/consent?client_id=client_1&scope=openid",
) {
  const deleteSession = vi.fn();
  const createVerificationValue = vi.fn();
  const setNewSession = vi.fn();
  const setSignedCookie = vi.fn();
  const findOne = vi.fn().mockResolvedValue({ verified: true });
  const json = vi.fn((body) => body);
  const setHeader = vi.fn();
  const createAuthCookie = vi.fn(() => ({
    name: "better-auth.two_factor",
    attributes: { httpOnly: true, maxAge: 600, sameSite: "lax" },
  }));
  const context = {
    context: {
      adapter: { findOne },
      createAuthCookie,
      internalAdapter: { createVerificationValue, deleteSession },
      newSession: {
        session: { token: "test-session-token" },
        user: { id: "user_1", twoFactorEnabled },
      },
      secret: "test-auth-secret",
      setNewSession,
      responseHeaders: new Headers(location ? { location } : undefined),
    },
    json,
    setHeader,
    setSignedCookie,
  };

  return {
    context,
    createVerificationValue,
    deleteSession,
    findOne,
    json,
    setNewSession,
    setHeader,
    setSignedCookie,
  };
}

describe("email OTP two-factor bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches only the successful email OTP sign-in endpoint", () => {
    const matcher = emailOtpTwoFactorPlugin.hooks.after[0].matcher;

    expect(matcher({ path: "/sign-in/email-otp" } as never)).toBe(true);
    expect(matcher({ path: "/sign-in/email" } as never)).toBe(false);
    expect(matcher({ path: "/email-otp/send-verification-otp" } as never)).toBe(false);
  });

  it("leaves one-step email OTP sign-in unchanged when two-factor is disabled", async () => {
    const scenario = bridgeContext(false);

    await expect(enforceEmailOtpTwoFactor(scenario.context as never)).resolves.toBeUndefined();

    expect(mocks.deleteSessionCookie).not.toHaveBeenCalled();
    expect(scenario.deleteSession).not.toHaveBeenCalled();
    expect(scenario.createVerificationValue).not.toHaveBeenCalled();
    expect(scenario.setSignedCookie).not.toHaveBeenCalled();
  });

  it("removes the full session and creates Better Auth pending challenge state", async () => {
    const scenario = bridgeContext(true);

    await expect(enforceEmailOtpTwoFactor(scenario.context as never)).resolves.toEqual({
      twoFactorMethods: ["totp"],
      twoFactorRedirect: true,
    });

    expect(mocks.deleteSessionCookie).toHaveBeenCalledWith(scenario.context, true);
    expect(scenario.deleteSession).toHaveBeenCalledWith("test-session-token");
    expect(scenario.setNewSession).toHaveBeenCalledWith(null);
    expect(scenario.createVerificationValue).toHaveBeenNthCalledWith(1, {
      expiresAt: new Date("2026-07-24T10:10:00.000Z"),
      identifier: "2fa-pendingidentifier1234",
      value: "user_1",
    });
    expect(scenario.createVerificationValue).toHaveBeenNthCalledWith(2, {
      expiresAt: new Date("2026-07-24T10:10:00.000Z"),
      identifier: "2fa-attempts-2fa-pendingidentifier1234",
      value: "0",
    });
    expect(scenario.setSignedCookie).toHaveBeenCalledWith(
      "better-auth.two_factor",
      "2fa-pendingidentifier1234",
      "test-auth-secret",
      { httpOnly: true, maxAge: 600, sameSite: "lax" },
    );
    expect(scenario.findOne).toHaveBeenCalledWith({
      model: "twoFactor",
      where: [{ field: "userId", value: "user_1" }],
    });
    expect(scenario.json).toHaveBeenCalledWith({
      twoFactorMethods: ["totp"],
      twoFactorRedirect: true,
    });
  });

  it("matches completed social OAuth callbacks and social sign-ins", () => {
    const matcher = socialOAuthTwoFactorPlugin.hooks.after[0].matcher;

    expect(matcher({ path: "/callback/:id" } as never)).toBe(true);
    expect(matcher({ path: "/sign-in/social" } as never)).toBe(true);
    expect(matcher({ path: "/oauth2/callback/:providerId" } as never)).toBe(false);
  });

  it.each(["google", "github"])(
    "replaces a two-factor %s session with a pending challenge and preserves an internal OAuth return path",
    async (provider) => {
      const returnPath = `/oauth/consent?provider=${provider}&scope=openid`;
      const scenario = bridgeContext(true, returnPath);

      await expect(enforceSocialOAuthTwoFactor(scenario.context as never)).resolves.toBeUndefined();

      expect(mocks.deleteSessionCookie).toHaveBeenCalledWith(scenario.context, true);
      expect(scenario.deleteSession).toHaveBeenCalledWith("test-session-token");
      expect(scenario.setNewSession).toHaveBeenCalledWith(null);
      expect(scenario.setHeader).toHaveBeenCalledWith(
        "location",
        `/two-factor?next=${encodeURIComponent(returnPath)}`,
      );
    },
  );

  it("challenges a completed ID-token social sign-in session", async () => {
    const matcher = socialOAuthTwoFactorPlugin.hooks.after[0].matcher;
    const scenario = bridgeContext(true, "");

    expect(matcher({ path: "/sign-in/social" } as never)).toBe(true);
    await expect(enforceSocialOAuthTwoFactor(scenario.context as never)).resolves.toBeUndefined();

    expect(scenario.deleteSession).toHaveBeenCalledWith("test-session-token");
    expect(scenario.setNewSession).toHaveBeenCalledWith(null);
    expect(scenario.setHeader).toHaveBeenCalledWith("location", "/two-factor");
  });

  it("keeps the successful social callback when two-factor is disabled", async () => {
    const scenario = bridgeContext(false);

    await expect(enforceSocialOAuthTwoFactor(scenario.context as never)).resolves.toBeUndefined();

    expect(mocks.deleteSessionCookie).not.toHaveBeenCalled();
    expect(scenario.setHeader).not.toHaveBeenCalled();
  });

  it.each([
    ["/app/settings?section=api-keys", "/two-factor?next=%2Fapp%2Fsettings%3Fsection%3Dapi-keys"],
    ["https://evil.example.com", "/two-factor"],
    ["//evil.example.com", "/two-factor"],
  ])("redirects social OAuth %s safely", (location, expected) => {
    expect(socialOAuthTwoFactorLocation(location)).toBe(expected);
  });
});
