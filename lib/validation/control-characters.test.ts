import { describe, expect, it } from "vitest";
import { hasAsciiControlCharacters } from "./control-characters";

describe("opaque identity and retained-text ASCII control boundary", () => {
  it("rejects every C0 byte and DEL anywhere in an otherwise printable value", () => {
    for (const code of [...Array(32).keys(), 127]) {
      const control = String.fromCharCode(code);
      expect(hasAsciiControlCharacters(control)).toBe(true);
      expect(hasAsciiControlCharacters(`original${control}identity`)).toBe(true);
    }
  });

  it.each(["", "original-id_123", "https://example.test/a?x=1", "Łódź 日本語 😀", " ", "~"])(
    "keeps printable text and exact Unicode without normalization: %s",
    (value) => expect(hasAsciiControlCharacters(value)).toBe(false),
  );
});
