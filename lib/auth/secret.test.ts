import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthCryptoKey, resolveAuthSecret } from "./secret";

describe("auth secret resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the existing string-secret configuration", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "string-auth-secret-for-tests");
    vi.stubEnv("BETTER_AUTH_SECRETS", "");

    expect(resolveAuthSecret()).toBe("string-auth-secret-for-tests");
    expect(resolveAuthCryptoKey()).toBe("string-auth-secret-for-tests");
  });

  it("builds the versioned crypto configuration used by Better Auth", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "legacy-auth-secret-for-tests");
    vi.stubEnv(
      "BETTER_AUTH_SECRETS",
      "4:current-versioned-auth-secret-for-tests,3:retired-versioned-auth-secret-for-tests",
    );

    const key = resolveAuthCryptoKey();
    expect(typeof key).toBe("object");
    if (typeof key === "string") throw new Error("Expected versioned auth key.");
    expect(key.currentVersion).toBe(4);
    expect(key.keys.size).toBe(2);
    expect(key.legacySecret).toBe("legacy-auth-secret-for-tests");
  });

  it("rejects malformed versioned configuration without echoing secret input", () => {
    const configured = "invalid-secret-input";
    vi.stubEnv("BETTER_AUTH_SECRET", "legacy-auth-secret-for-tests");
    vi.stubEnv("BETTER_AUTH_SECRETS", configured);

    expect(() => resolveAuthCryptoKey()).toThrow("entry 1 is invalid");
    try {
      resolveAuthCryptoKey();
    } catch (error) {
      expect(String(error)).not.toContain(configured);
    }
  });
});
