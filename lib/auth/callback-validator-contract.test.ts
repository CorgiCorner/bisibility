// @vitest-environment node

import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";
import { loginErrorReturnTo, mergeReturnToHash } from "./return-to";

const auth = betterAuth({
  baseURL: "https://example.test",
  rateLimit: { enabled: false },
  secret: "test-secret-at-least-32-characters-long",
});

describe("better-auth relative callback validation", () => {
  it("pins the accepted relative callback syntax", async () => {
    const context = await auth.$context;
    const options = { allowRelativePaths: true };

    expect(context.isTrustedOrigin("/app/settings", options)).toBe(true);
    expect(context.isTrustedOrigin("/app/settings?section=api-keys", options)).toBe(true);
    expect(context.isTrustedOrigin("/app/settings#api-keys", options)).toBe(false);
    expect(context.isTrustedOrigin("//evil.com", options)).toBe(false);
  });

  it("keeps the callback produced for a deep link trusted", async () => {
    const context = await auth.$context;
    const callbackURL = mergeReturnToHash("/app/settings", "#api-keys");
    const errorCallbackURL = loginErrorReturnTo(callbackURL);

    expect(context.isTrustedOrigin(callbackURL, { allowRelativePaths: true })).toBe(true);
    expect(context.isTrustedOrigin(errorCallbackURL, { allowRelativePaths: true })).toBe(true);
  });
});
