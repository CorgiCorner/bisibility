import { describe, expect, it } from "vitest";
import { normalizeLandingPath } from "./join";

describe("normalizeLandingPath", () => {
  it.each([
    ["https://example.com/pricing", "/pricing"],
    ["https://example.org/pricing/?plan=pro#section", "/pricing?plan=pro"],
    ["/docs/", "/docs"],
    ["/docs/?a=b", "/docs?a=b"],
    ["/", "/"],
    ["/?a=b", "/?a=b"],
    ["https://example.com/", "/"],
    ["/Docs/API", "/Docs/API"],
    ["blog/post#summary", "/blog/post"],
    ["?tab=api", "/?tab=api"],
    ["", "/"],
  ])("normalizes %s as %s", (input, expected) => {
    expect(normalizeLandingPath(input)).toBe(expected);
  });

  it.each([
    ["https://example.com/über", "/über"],
    ["https://example.com/a b", "/a b"],
  ])("uses the same encoded key for absolute and relative paths", (absolute, relative) => {
    expect(normalizeLandingPath(absolute)).toBe(normalizeLandingPath(relative));
  });
});
