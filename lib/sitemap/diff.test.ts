import { describe, expect, it } from "vitest";
import { diffSitemapEntries } from "./diff";

describe("diffSitemapEntries", () => {
  it("reports added, removed, and lastmod-changed URLs", () => {
    expect(
      diffSitemapEntries(
        [
          { lastmod: "2026-07-01", loc: "https://example.com/kept" },
          { loc: "https://example.com/removed" },
          { lastmod: "2026-07-02", loc: "https://example.com/changed" },
        ],
        [
          { loc: "https://example.com/added" },
          { lastmod: "2026-07-01", loc: "https://example.com/kept" },
          { lastmod: "2026-07-03", loc: "https://example.com/changed" },
        ],
      ),
    ).toEqual({
      added: ["https://example.com/added"],
      lastmodChanged: ["https://example.com/changed"],
      removed: ["https://example.com/removed"],
    });
  });

  it("treats locs as a set and preserves first-seen output order", () => {
    expect(
      diffSitemapEntries(
        [{ loc: "https://example.com/a" }, { loc: "https://example.com/a" }],
        [
          { loc: "https://example.com/b" },
          { loc: "https://example.com/a" },
          { loc: "https://example.com/b" },
        ],
      ),
    ).toEqual({
      added: ["https://example.com/b"],
      lastmodChanged: [],
      removed: [],
    });
  });
});
