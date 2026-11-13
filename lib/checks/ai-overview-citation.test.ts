import { describe, expect, it } from "vitest";
import { aiOverviewCitation } from "./ai-overview-citation";

const dataForSeoBlock = {
  items: [{ text: "" }, { text: "Summary title" }],
  rank_absolute: 2,
  rank_group: 1,
  type: "ai_overview",
};

const serpApiBlock = {
  text_blocks: [{ snippet: "First overview snippet", title: "Later title" }, { snippet: "Later" }],
};

describe("aiOverviewCitation", () => {
  it("treats a check with no overview item as not shown and complete", () => {
    expect(aiOverviewCitation([], "example.com")).toEqual({
      shown: false,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: true,
    });
  });

  it("marks a DataForSEO block without a sources list as shown but incomplete", () => {
    expect(aiOverviewCitation([{ rawFragment: dataForSeoBlock }], "example.com")).toEqual({
      shown: true,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: false,
    });
  });

  it("marks a SerpApi block without a sources list as shown but incomplete", () => {
    expect(
      aiOverviewCitation(
        [{ title: "First overview snippet", rawFragment: serpApiBlock }],
        "example.com",
      ),
    ).toEqual({
      shown: true,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 0,
      complete: false,
    });
  });

  it("cites the project host with or without www at the 1-based source index", () => {
    const rawFragment = {
      ...dataForSeoBlock,
      references: [
        { link: "https://other.example.org/a", title: "Other" },
        { link: "https://www.example.com/docs", title: "Docs" },
        { link: "javascript:alert(1)" },
      ],
    };
    expect(aiOverviewCitation([{ rawFragment }], "https://example.com")).toEqual({
      shown: true,
      cited: true,
      citedPosition: 2,
      citedUrl: "https://www.example.com/docs",
      sourceCount: 2,
      complete: true,
    });
  });

  it("does not treat a subdomain as the project", () => {
    const rawFragment = {
      ...serpApiBlock,
      references: [{ link: "https://blog.example.com/post", title: "Blog", source: "Example" }],
    };
    expect(aiOverviewCitation([{ rawFragment }], "example.com")).toMatchObject({
      shown: true,
      cited: false,
      citedPosition: null,
      citedUrl: null,
      sourceCount: 1,
      complete: true,
    });
  });

  it("treats an empty sources list as complete and not cited", () => {
    expect(
      aiOverviewCitation([{ rawFragment: { ...serpApiBlock, sources: [] } }], "example.com"),
    ).toMatchObject({ shown: true, cited: false, complete: true, sourceCount: 0 });
  });
});
