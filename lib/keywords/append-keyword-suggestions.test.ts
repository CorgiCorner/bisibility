import { describe, expect, it } from "vitest";
import { appendKeywordSuggestions } from "./add-keyword-drawer-shared";

describe("appendKeywordSuggestions", () => {
  it("preserves the draft and target URLs while excluding duplicate suggestions", () => {
    expect(
      appendKeywordSuggestions("First phrase | /first\nsecond phrase\n", [
        " FIRST PHRASE ",
        "new phrase",
        "NEW phrase",
        " ",
      ]),
    ).toBe("First phrase | /first\nsecond phrase\nnew phrase");
  });
  it("preserves meaningful punctuation in distinct queries", () => {
    expect(appendKeywordSuggestions("seo-api", ["seo api", "SEO-API"])).toBe("seo-api\nseo api");
  });
});
