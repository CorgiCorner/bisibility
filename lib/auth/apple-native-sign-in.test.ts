import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  APPLE_NATIVE_SIGN_IN_PATH,
  APPLE_NATIVE_SIGN_IN_RATE_LIMIT,
  appleNativeSignInPlugin,
} from "./apple-native-sign-in";

describe("native Sign in with Apple plugin", () => {
  const plugin = appleNativeSignInPlugin({ refreshGrant: vi.fn() });

  it("serves POST /api/auth/ios/apple", () => {
    expect(APPLE_NATIVE_SIGN_IN_PATH).toBe("/ios/apple");
    expect(plugin.endpoints.appleNativeSignIn.path).toBe("/ios/apple");
    expect(plugin.endpoints.appleNativeSignIn.options.method).toBe("POST");
  });

  it("rate limits the endpoint like Better Auth's sign-in routes", () => {
    const [rule] = plugin.rateLimit;
    expect(APPLE_NATIVE_SIGN_IN_RATE_LIMIT).toEqual({ max: 3, window: 10 });
    expect(rule).toMatchObject({ max: 3, window: 10 });
    expect(rule.pathMatcher("/ios/apple")).toBe(true);
    expect(rule.pathMatcher("/oauth2/token")).toBe(false);
  });
});
