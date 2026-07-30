import { describe, expect, it } from "vitest";
import {
  hasPerLineTarget,
  keywordTargetLineError,
  parseKeywordTargetLines,
} from "./add-keyword-drawer-shared";

describe("parseKeywordTargetLines", () => {
  it("treats a plain line as a keyword with no target", () => {
    expect(parseKeywordTargetLines("rank tracker")).toEqual([
      { error: null, keyword: "rank tracker", targetUrl: null },
    ]);
  });

  it("parses an absolute URL and a leading-slash path override", () => {
    const parsed = parseKeywordTargetLines(
      "seo api | https://example.com/api\nrank tracker | /features",
    );

    expect(parsed).toEqual([
      { error: null, keyword: "seo api", targetUrl: "https://example.com/api" },
      { error: null, keyword: "rank tracker", targetUrl: "/features" },
    ]);
    expect(hasPerLineTarget(parsed)).toBe(true);
  });

  it("trims whitespace around keyword and URL", () => {
    expect(parseKeywordTargetLines("  seo tool   |   https://x.com/p  ")).toEqual([
      { error: null, keyword: "seo tool", targetUrl: "https://x.com/p" },
    ]);
  });

  it("flags bad URLs (not absolute, not a path) with a per-entry error", () => {
    const parsed = parseKeywordTargetLines(
      "a | not a url\nb | example.com/no-scheme\nc | //evil.com",
    );

    expect(parsed.map((entry) => entry.error)).toEqual([
      '"not a url" is not a valid URL or path.',
      '"example.com/no-scheme" is not a valid URL or path.',
      '"//evil.com" is not a valid URL or path.',
    ]);
    expect(parsed.every((entry) => entry.targetUrl === null)).toBe(true);
    expect(keywordTargetLineError(parsed)).toBe('"not a url" is not a valid URL or path.');
  });

  it("errors when the keyword is missing before the pipe", () => {
    expect(parseKeywordTargetLines("| https://example.com")).toEqual([
      { error: "Add a keyword before the | target URL.", keyword: "", targetUrl: null },
    ]);
  });

  it("treats a trailing pipe with no URL as a plain keyword", () => {
    expect(parseKeywordTargetLines("rank tracker |")).toEqual([
      { error: null, keyword: "rank tracker", targetUrl: null },
    ]);
  });

  it("handles mixed lines and skips blanks", () => {
    const parsed = parseKeywordTargetLines(
      "plain keyword\n\nseo api | https://example.com/api\nanother plain",
    );

    expect(parsed.map((entry) => entry.keyword)).toEqual([
      "plain keyword",
      "seo api",
      "another plain",
    ]);
    expect(hasPerLineTarget(parsed)).toBe(true);
    expect(keywordTargetLineError(parsed)).toBeNull();
  });

  it("reports no per-line target for an all-plain list", () => {
    expect(hasPerLineTarget(parseKeywordTargetLines("one\ntwo\nthree"))).toBe(false);
  });
});
