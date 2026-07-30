import { createCipheriv, createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashApiKey,
  isEncryptedSecret,
  verifyApiKey,
} from "./crypto";

const primaryKey = Buffer.alloc(32, 7);
const retiredKey = Buffer.alloc(32, 8);
const legacyFixture =
  "v1:CQkJCQkJCQkJCQkJ:sK4QgZPOiL39ar2QZCjGwA==:XKfo+9mZr0OaQKddgYvApvnFEJZGzNviH8811aIbcx7x38WvhzVLcwae1Xc3R5S7DjC86Q==";
const legacyRaw = JSON.stringify({ login: "legacy-user", password: "legacy-password" });

function keyId(key: Buffer) {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function encryptedFixture(key: Buffer, raw: string) {
  const iv = Buffer.alloc(12, 10);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const value = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return [
    "v2",
    keyId(key),
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    value.toString("base64"),
  ].join(":");
}

describe("provider crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts with the primary key in the v2 key-id format", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", retiredKey.toString("base64"));
    const raw = JSON.stringify({ login: "provider-login", password: "provider-password" });
    const encrypted = encryptSecret(raw);

    expect(encrypted.split(":")).toHaveLength(5);
    expect(encrypted.split(":").slice(0, 2)).toEqual(["v2", keyId(primaryKey)]);
    expect(encrypted).not.toBe(raw);
    expect(decryptSecret(encrypted)).toBe(raw);
  });

  it("decrypts a stable legacy v1 fixture with the primary key", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));

    expect(decryptSecret(legacyFixture)).toBe(legacyRaw);
  });

  it("decrypts retired-key v2 secrets only while the key is configured", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
    const encrypted = encryptedFixture(retiredKey, "retired-value");

    expect(() => decryptSecret(encrypted)).toThrow("unsupported format");

    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", retiredKey.toString("base64"));
    expect(decryptSecret(encrypted)).toBe("retired-value");
  });

  it("rejects unknown key ids", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
    const encrypted = encryptedFixture(primaryKey, "provider-value");
    const [, , ...rest] = encrypted.split(":");

    expect(() => decryptSecret(["v2", "00000000", ...rest].join(":"))).toThrow(
      "unsupported format",
    );
  });

  it("recognizes v1 and v2 envelopes without requiring their decryption key", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
    const encrypted = encryptedFixture(retiredKey, "retired-value");

    expect(isEncryptedSecret(legacyFixture)).toBe(true);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(isEncryptedSecret("legacy-redacted-credentials")).toBe(false);
  });

  it.each(["not-base64", Buffer.alloc(8, 4).toString("base64")])(
    "rejects malformed retired key configuration without echoing it",
    (configured) => {
      vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
      vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", configured);

      expect(() => encryptSecret("provider-value")).toThrowError(
        "BISIBILITY_SECRETS_KEYS_RETIRED must contain base64-encoded 32-byte keys.",
      );
      try {
        encryptSecret("provider-value");
      } catch (error) {
        expect(String(error)).not.toContain(configured);
      }
    },
  );

  it("accepts an empty retired-key configuration", () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", primaryKey.toString("base64"));
    vi.stubEnv("BISIBILITY_SECRETS_KEYS_RETIRED", "");

    expect(decryptSecret(encryptSecret("provider-value"))).toBe("provider-value");
  });

  it("preserves the production primary-key requirement", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", "");

    expect(() => encryptSecret("provider-value")).toThrow(
      "BISIBILITY_SECRETS_KEY is required to encrypt provider credentials.",
    );
  });

  it("hashes and verifies issued API keys without storing the raw key", () => {
    const raw = "bisi_live_secret";
    const hash = hashApiKey(raw);

    expect(hash).not.toContain(raw);
    expect(verifyApiKey(raw, hash)).toBe(true);
    expect(verifyApiKey("wrong", hash)).toBe(false);
  });
});
