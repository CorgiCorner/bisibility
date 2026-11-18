import { keywordTupleKey } from "@/lib/actions/keyword-batch";
import { uniqueKeywordTexts } from "@/lib/actions/keyword-create";
import { addKeywordsMatrixSchema, addKeywordsSchema } from "@/lib/schemas/keyword";
import { describe, expect, it } from "vitest";

describe("keyword creation input characterization", () => {
  it("matrix trims and deduplicates terms case-insensitively before tuple creation", () => {
    const input = addKeywordsMatrixSchema.parse({
      projectId: "project",
      keywords: [" rank ", "Rank", "seo"],
      devices: ["desktop"],
      locations: [{ locationKey: "US" }],
    });
    expect(uniqueKeywordTexts(input.keywords)).toEqual(["rank", "seo"]);
  });
  it("batch preserves case and tuple identity includes both device and resolved location", () => {
    const input = addKeywordsSchema.parse({ projectId: "project", keywords: ["rank", "Rank"] });
    expect(input.keywords).toEqual(["rank", "Rank"]);
    expect(keywordTupleKey("rank", "US", "desktop")).not.toBe(
      keywordTupleKey("rank", "US", "mobile"),
    );
    expect(keywordTupleKey("rank", "US", "desktop")).not.toBe(
      keywordTupleKey("rank", "PL", "desktop"),
    );
  });
});
