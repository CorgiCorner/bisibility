import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthClient: vi.fn(() => ({ client: true })),
  emailOTPClient: vi.fn(() => ({ id: "email-otp" })),
  oauthProviderClient: vi.fn(() => ({ id: "oauth-provider" })),
  twoFactorClient: vi.fn((_options?: { onTwoFactorRedirect?: () => void }) => ({
    id: "two-factor",
  })),
}));

vi.mock("@better-auth/oauth-provider/client", () => ({
  oauthProviderClient: mocks.oauthProviderClient,
}));
vi.mock("better-auth/client/plugins", () => ({
  emailOTPClient: mocks.emailOTPClient,
  twoFactorClient: mocks.twoFactorClient,
}));
vi.mock("better-auth/react", () => ({
  createAuthClient: mocks.createAuthClient,
}));

import { authClient } from "./client";

describe("auth client", () => {
  it("continues signed OAuth requests through unauthenticated sign-in", () => {
    expect(mocks.twoFactorClient).toHaveBeenCalledWith({
      onTwoFactorRedirect: expect.any(Function),
    });
    expect(mocks.twoFactorClient.mock.calls[0]?.[0]?.onTwoFactorRedirect?.()).toBeUndefined();
    expect(mocks.createAuthClient).toHaveBeenCalledWith({
      plugins: [{ id: "oauth-provider" }, { id: "email-otp" }, { id: "two-factor" }],
    });
    expect(authClient).toEqual({ client: true });
  });
});
