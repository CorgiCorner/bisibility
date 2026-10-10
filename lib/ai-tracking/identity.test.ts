import { describe, expect, it } from "vitest";
import { boundedRaw, boundedUtf8, canonicalJson, exactTextHash, payloadHash } from "./identity";
import { promptInputSchema } from "./schema";

describe("tracking retained identities", () => {
  it("keeps exact prompt bytes significant and canonicalizes object key order", () => {
    expect(exactTextHash("hello\n")).not.toBe(exactTextHash("hello"));
    expect(exactTextHash("é")).not.toBe(exactTextHash("e\u0301"));
    expect(payloadHash({ a: 1, b: [2, 3] })).toBe(payloadHash({ b: [2, 3], a: 1 }));
    expect(payloadHash([2, 3])).not.toBe(payloadHash([3, 2]));
    expect(promptInputSchema.parse({ text: "  Exact\n" }).text).toBe("  Exact\n");
  });
  it("bounds unicode by bytes without splitting codepoints or misreporting truncation", () => {
    expect(boundedUtf8("🙂éx", 5)).toEqual({ text: "🙂", truncated: true });
    expect(boundedUtf8("🙂é", 6)).toEqual({ text: "🙂é", truncated: false });
    const raw = boundedRaw({ payload: "🙂".repeat(140000) });
    expect(raw.truncated).toBe(true);
    const escaped = boundedRaw({ answer: "\u0000".repeat(100000) });
    expect(Buffer.byteLength(canonicalJson(escaped.raw), "utf8")).toBeLessThanOrEqual(512 * 1024);
    expect(Buffer.byteLength(canonicalJson(raw.raw), "utf8")).toBeLessThanOrEqual(512 * 1024);
  });
});
