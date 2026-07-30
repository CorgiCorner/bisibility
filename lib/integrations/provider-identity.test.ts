import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readableProviderIdentity } from "./provider-identity";

const key = (byte: number) => Buffer.alloc(32, byte).toString("base64");
const legacyFixture =
  "v1:CQkJCQkJCQkJCQkJ:sK4QgZPOiL39ar2QZCjGwA==:XKfo+9mZr0OaQKddgYvApvnFEJZGzNviH8811aIbcx7x38WvhzVLcwae1Xc3R5S7DjC86Q==";

describe("readable provider identity", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("distinguishes absent and legacy credential placeholders", () => {
    expect(readableProviderIdentity(null)).toEqual({ state: "absent" });
    expect(readableProviderIdentity("")).toEqual({ state: "absent" });
    expect(readableProviderIdentity("legacy-redacted-credentials")).toEqual({ state: "absent" });
  });

  it("returns only readable identity fields from v2 keyring ciphertext", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", key(1));
    const encrypted = encryptSecret(
      JSON.stringify({
        apiKey: "secret-token",
        endpoint: "https://stats.example.com",
        login: "example.com",
      }),
    );

    expect(readableProviderIdentity(encrypted)).toEqual({
      endpoint: "https://stats.example.com",
      login: "example.com",
      state: "readable",
    });
  });

  it("returns only readable identity fields from legacy v1 ciphertext", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", key(7));

    expect(readableProviderIdentity(legacyFixture)).toEqual({
      login: "legacy-user",
      state: "readable",
    });
  });

  it("reports v2 ciphertext with an unknown key id as unreadable", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", key(1));
    const encrypted = encryptSecret(JSON.stringify({ login: "example.com" }));
    vi.stubEnv("BISIBILITY_SECRETS_KEY", key(2));

    expect(readableProviderIdentity(encrypted)).toEqual({
      reason: "decryption_failed",
      state: "unreadable",
    });
  });
});
