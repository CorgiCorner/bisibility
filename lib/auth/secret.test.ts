import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthCryptoKey, resolveAuthSecret, resolveAuthSecrets } from "./secret";

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
    expect(resolveAuthSecrets()).toEqual([
      { value: "current-versioned-auth-secret-for-tests", version: 4 },
      { value: "retired-versioned-auth-secret-for-tests", version: 3 },
    ]);
  });

  it("uses the current version after the legacy singular secret is retired", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRETS", "5:current-versioned-auth-secret-for-tests");

    expect(resolveAuthSecret()).toBe("current-versioned-auth-secret-for-tests");
    const key = resolveAuthCryptoKey();
    expect(typeof key).toBe("object");
    if (typeof key === "string") throw new Error("Expected versioned auth key.");
    expect(key.currentVersion).toBe(5);
    expect(key.legacySecret).toBe("current-versioned-auth-secret-for-tests");
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

  it("rejects a keyring whose versions are not strictly descending", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "legacy-auth-secret-for-tests");
    vi.stubEnv(
      "BETTER_AUTH_SECRETS",
      "3:retired-versioned-auth-secret-for-tests,4:current-versioned-auth-secret-for-tests",
    );

    expect(() => resolveAuthCryptoKey()).toThrow(
      "BETTER_AUTH_SECRETS versions must be strictly descending",
    );
  });

  it("rejects an explicitly configured weak legacy secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short");
    vi.stubEnv("BETTER_AUTH_SECRETS", "5:current-versioned-auth-secret-for-tests");

    expect(() => resolveAuthSecret()).toThrow("BETTER_AUTH_SECRET must be a strong");
    expect(() => resolveAuthCryptoKey()).toThrow("BETTER_AUTH_SECRET must be a strong");
  });
});
