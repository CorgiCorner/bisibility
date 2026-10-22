import { appPath } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import {
  savedKeywordResearchHref,
  savedKeywordResearchHrefForKeyword,
} from "./saved-keywords-table-model";

describe("saved keyword research links", () => {
  it("keeps the source seed for existing research links", () => {
    expect(savedKeywordResearchHref("prj_1", { location: "US", sourceSeed: "standing desk" })).toBe(
      `${appPath("prj_1", "keyword-research")}?seed=standing+desk&location=US`,
    );
    expect(savedKeywordResearchHref("prj_1", { location: "US", sourceSeed: null })).toBe(
      `${appPath("prj_1", "keyword-research")}?location=US`,
    );
  });

  it("seeds research from the saved keyword and keeps its location", () => {
    expect(
      savedKeywordResearchHrefForKeyword("prj_1", {
        location: "ES@en",
        text: "standing desk mat",
      }),
    ).toBe(`${appPath("prj_1", "keyword-research")}?seed=standing+desk+mat&location=ES%40en`);
  });
});
