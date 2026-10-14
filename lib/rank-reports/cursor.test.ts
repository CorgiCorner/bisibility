import { describe, expect, it, vi } from "vitest";
import { createReportCursorCodec } from "./cursor";
import { reportDigest } from "./digest";

vi.mock("server-only", () => ({}));

describe("authenticated report cursor", () => {
  const key = "synthetic-signing-key-for-fixtures-only";
  const payload = {
    asOf: "2026-10-12T12:00:00.000Z",
    binding: reportDigest({ actor: "user-a", transport: "session" }),
    last: { at: "2026-10-12T10:00:00.000Z", id: "check_abcdefghijklmnopqrstuvwx" },
    source: reportDigest({ retained: 103 }),
    version: 1 as const,
  };
  it("round trips only opaque identity digests and public page keys", () => {
    const codec = createReportCursorCodec(key);
    const token = codec.encode(payload);
    expect(codec.decode(token)).toEqual(payload);
    expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain("user-a");
  });
  it("rejects body changes, another key and malformed signatures", () => {
    const codec = createReportCursorCodec(key);
    const token = codec.encode(payload);
    const body = Buffer.from(
      JSON.stringify({ ...payload, asOf: "2027-01-01T00:00:00.000Z" }),
    ).toString("base64url");
    expect(() => codec.decode(`${body}.${token.split(".")[1]}`)).toThrow();
    expect(() =>
      createReportCursorCodec("another-synthetic-fixture-signing-key").decode(token),
    ).toThrow();
    expect(() => codec.decode(`${token}.extra`)).toThrow();
    expect(() => codec.decode("not-a-cursor")).toThrow();
  });
  it("pins a caller-owned binary signing key for a stable codec lifetime", () => {
    const bytes = new Uint8Array(32).fill(7);
    const codec = createReportCursorCodec(bytes);
    const token = codec.encode(payload);
    bytes.fill(9);
    expect(codec.decode(token)).toEqual(payload);
  });
});
