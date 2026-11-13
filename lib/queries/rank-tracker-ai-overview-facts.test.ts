import { describe, expect, it } from "vitest";
import { aiOverviewFactsFromRows } from "./rank-tracker-ai-overview-facts";

const checkedAt = new Date("2026-11-09T07:11:00.000Z");

describe("aiOverviewFactsFromRows", () => {
  it("derives a cited DataForSEO block and a path on the project host", () => {
    const [fact] = aiOverviewFactsFromRows(
      [
        {
          keywordId: "kw_abcdefghijklmnopqrstuvwx",
          checkedAt,
          title: "Summary title",
          rawFragment: {
            items: [{ text: "Summary title" }],
            references: [
              { link: "https://other.example.org/a", title: "Other" },
              { link: "https://www.example.com/docs", title: "Docs" },
            ],
            type: "ai_overview",
          },
        },
      ],
      "example.com",
    );
    expect(fact).toMatchObject({
      keywordId: "kw_abcdefghijklmnopqrstuvwx",
      citation: { shown: true, cited: true, citedPosition: 2, complete: true },
      citedPath: "/docs",
    });
    expect(fact?.overview?.sources).toHaveLength(2);
  });

  it("keeps a SerpApi block without sources incomplete and uncitable", () => {
    const [fact] = aiOverviewFactsFromRows(
      [
        {
          keywordId: "kw_bbcdefghijklmnopqrstuvwx",
          checkedAt,
          title: "First overview snippet",
          rawFragment: {
            text_blocks: [{ snippet: "First overview snippet", title: "Later title" }],
          },
        },
      ],
      "example.com",
    );
    expect(fact?.citation).toMatchObject({ shown: true, cited: false, complete: false });
    expect(fact?.citedPath).toBeNull();
  });

  it("records a completed check with no overview item as not shown", () => {
    const [fact] = aiOverviewFactsFromRows(
      [
        {
          keywordId: "kw_cbcdefghijklmnopqrstuvwx",
          checkedAt,
          title: null,
          rawFragment: null,
        },
      ],
      "example.com",
    );
    expect(fact?.citation).toEqual({
      shown: false,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: true,
    });
  });
});
