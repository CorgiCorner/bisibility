import { describe, expect, it } from "vitest";
import { findLiteralWordMatch } from "./literal-match";

describe("literal entity name matching", () => {
  it.each(["Beta+", "[Acme]", "(a+)+$", "a.b", "a\\b", "Acme?"])(
    "treats %s as a literal name",
    (alias) => {
      expect(findLiteralWordMatch(`Try ${alias} today`, alias)).toEqual({
        index: 4,
        length: alias.length,
      });
    },
  );

  it.each(["éAcme", "Acme９", "𐐀Acme", "Acme𐐀", "١Acme", "Acmeology"])(
    "rejects a name joined to a Unicode letter or number in %s",
    (answer) => expect(findLiteralWordMatch(answer, "Acme")).toBeNull(),
  );

  it("finds a later valid occurrence after an embedded name", () => {
    expect(findLiteralWordMatch("Acmeology, then Acme", "Acme")).toEqual({
      index: 16,
      length: 4,
    });
    expect(findLiteralWordMatch("x... ", "..")).toEqual({ index: 2, length: 2 });
  });

  it.each([
    ["K", "k", true],
    ["ſ", "S", true],
    ["ς", "Σ", true],
    ["ϐ", "Β", true],
    ["ß", "ẞ", true],
    ["𐐀", "𐐨", true],
    ["ΐ", "ΐ", true],
    ["ΰ", "ΰ", true],
    ["ﬅ", "ﬆ", true],
    ["ı", "I", false],
    ["İ", "i", false],
    ["ﬀ", "ff", false],
  ])("preserves Unicode case matching for %s and %s", (answer, alias, matches) => {
    expect(findLiteralWordMatch(answer, alias, true) !== null).toBe(matches);
  });

  it("preserves the original answer offset after a character with expanding lowercase", () => {
    const answer = "İ. Try ACME today";
    expect(findLiteralWordMatch(answer, "Acme", true)).toEqual({ index: 7, length: 4 });
  });

  it("rejects empty aliases and surrogate halves inside a complete character", () => {
    expect(findLiteralWordMatch("Anything", "")).toBeNull();
    expect(findLiteralWordMatch("😀", "\uD83D")).toBeNull();
    expect(findLiteralWordMatch("😀", "\uDE00")).toBeNull();
  });
});
