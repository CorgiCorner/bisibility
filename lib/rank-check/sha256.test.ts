import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Bytes, sha256Hex } from "./sha256";

const vectors = [
  {
    digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    input: "",
  },
  {
    digest: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    input: "abc",
  },
  {
    digest: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
  },
] as const;

describe("browser-compatible SHA-256", () => {
  it.each(vectors)("matches the standard vector for $input", ({ digest, input }) => {
    expect(sha256Hex(input)).toBe(digest);
  });

  it.each(["keyword_1", "Zażółć gęślą jaźń", "日本語 keyword"])(
    "matches the Node server digest for %s",
    (input) => {
      const serverDigest = createHash("sha256").update(input).digest("hex");

      expect(sha256Hex(input)).toBe(serverDigest);
      expect(Buffer.from(sha256Bytes(input)).toString("hex")).toBe(serverDigest);
    },
  );
});
