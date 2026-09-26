import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPreviewToken, type PreviewTokenError, verifyPreviewToken } from "./preview-token";

const PRIMARY = Buffer.alloc(32, 1).toString("base64");
const RETIRED = Buffer.alloc(32, 2).toString("base64");
const now = new Date("2026-09-02T10:00:00.000Z");
const expected = {
  depth: 50 as const,
  estimateCents: 30,
  projectId: "project_1",
  providerId: "provider-a",
  selectionHash: "a".repeat(64),
  trigger: "manual" as const,
};

function primarySignature(canonical: string) {
  const primaryKey = createHmac("sha256", Buffer.from(PRIMARY, "base64"))
    .update("rank-check-run-preview")
    .digest();
  return createHmac("sha256", primaryKey).update(Buffer.from(canonical)).digest("base64url");
}

describe("rank-check preview token", () => {
  beforeEach(() => {
    process.env.BISIBILITY_SECRETS_KEY = PRIMARY;
    delete process.env.BISIBILITY_SECRETS_KEYS_RETIRED;
  });
  afterEach(() => {
    delete process.env.BISIBILITY_SECRETS_KEY;
    delete process.env.BISIBILITY_SECRETS_KEYS_RETIRED;
  });

  it("round trips a valid signed payload", () => {
    const signed = createPreviewToken(expected, now);
    expect(verifyPreviewToken(signed.token, expected, now)).toEqual({
      ...expected,
      exp: Math.floor(now.getTime() / 1000) + 600,
    });
  });

  it("signs the canonical JSON payload bytes", () => {
    const { token } = createPreviewToken(expected, now);
    const [, encodedSignature] = token.split(".");
    const canonical = JSON.stringify({
      projectId: expected.projectId,
      selectionHash: expected.selectionHash,
      depth: expected.depth,
      providerId: expected.providerId,
      estimateCents: expected.estimateCents,
      exp: Math.floor(now.getTime() / 1000) + 600,
      trigger: expected.trigger,
    });

    expect(encodedSignature).toBe(primarySignature(canonical));
  });

  it("reads a token signed before the trigger field as an API preview", () => {
    const { trigger: _trigger, ...legacy } = expected;
    const canonical = JSON.stringify({ ...legacy, exp: Math.floor(now.getTime() / 1000) + 600 });
    const token = `${Buffer.from(canonical).toString("base64url")}.${primarySignature(canonical)}`;

    expect(verifyPreviewToken(token, { ...expected, trigger: "api" }, now)).toMatchObject({
      trigger: "api",
    });
    expect(() => verifyPreviewToken(token, expected, now)).toThrowError(
      expect.objectContaining<Partial<PreviewTokenError>>({ code: "mismatch" }),
    );
  });

  it("rejects tampering with every signed payload field", () => {
    const { token } = createPreviewToken(expected, now);
    const [payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8"));
    for (const change of [
      { depth: 100 },
      { estimateCents: 31 },
      { exp: decoded.exp + 1 },
      { projectId: "project_2" },
      { providerId: "provider-b" },
      { selectionHash: "b".repeat(64) },
      { trigger: "api" },
    ]) {
      const altered = Buffer.from(JSON.stringify({ ...decoded, ...change })).toString("base64url");
      expect(() => verifyPreviewToken(`${altered}.${signature}`, expected, now)).toThrowError(
        expect.objectContaining<Partial<PreviewTokenError>>({ code: "tampered" }),
      );
    }
  });

  it("distinguishes expiry from an expected-field mismatch", () => {
    const { token } = createPreviewToken(expected, now);
    const expiredAt = new Date(now.getTime() + 601_000);

    expect(() => verifyPreviewToken(token, expected, expiredAt)).toThrowError(
      expect.objectContaining<Partial<PreviewTokenError>>({ code: "expired" }),
    );
    for (const mismatch of [
      { ...expected, selectionHash: "b".repeat(64) },
      { ...expected, depth: 100 as const },
      { ...expected, providerId: "provider-b" },
      { ...expected, trigger: "api" as const },
    ]) {
      expect(() => verifyPreviewToken(token, mismatch, now)).toThrowError(
        expect.objectContaining<Partial<PreviewTokenError>>({ code: "mismatch" }),
      );
    }
  });

  it("verifies a token signed by a retired key", () => {
    const { token } = createPreviewToken(expected, now);
    process.env.BISIBILITY_SECRETS_KEY = RETIRED;
    process.env.BISIBILITY_SECRETS_KEYS_RETIRED = PRIMARY;

    expect(verifyPreviewToken(token, expected, now)).toMatchObject(expected);
  });
});
