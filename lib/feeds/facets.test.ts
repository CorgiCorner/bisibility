import {
  addFeedFacet,
  type FeedFacetOptions,
  parseFeedFacets,
  removeFeedFacet,
  serializeFeedFacets,
} from "@/lib/feeds/facets";
import { describe, expect, it } from "vitest";

const options = {
  engine: [{ label: "Google", value: "google" }],
  language: [
    { label: "English", value: "english" },
    { label: "Spanish", value: "spanish" },
  ],
  market: [{ label: "Malaga core", value: "pmkt_malaga" }],
  module: [{ label: "Rank", value: "rank" }],
  severity: [{ label: "Urgent", value: "urgent" }],
} satisfies FeedFacetOptions;

describe("feed facets", () => {
  it("parses, normalizes, deduplicates, and serializes every supported axis", () => {
    const result = parseFeedFacets(
      {
        f: [
          "severity:URGENT",
          "market:pmkt_malaga",
          "language:Spanish",
          "engine:GOOGLE",
          "module:rank",
          "severity:urgent",
        ],
      },
      options,
    );

    expect(result.rejected).toEqual([]);
    expect(result.facets).toEqual([
      { axis: "module", value: "rank" },
      { axis: "market", value: "pmkt_malaga" },
      { axis: "language", value: "spanish" },
      { axis: "engine", value: "google" },
      { axis: "severity", value: "urgent" },
    ]);
    expect(serializeFeedFacets(result.facets, options)).toEqual([
      "module:rank",
      "market:pmkt_malaga",
      "language:spanish",
      "engine:google",
      "severity:urgent",
    ]);
  });

  it("keeps unrelated parameters and resets pagination only when scope changes", () => {
    const current = new URLSearchParams("q=launch&page=3&filter=rankings&source=manual");
    const added = addFeedFacet(current, { axis: "market", value: "pmkt_malaga" }, options);

    expect(added.toString()).toBe("q=launch&filter=rankings&source=manual&f=market%3Apmkt_malaga");

    const unchanged = addFeedFacet(added, { axis: "market", value: "pmkt_malaga" }, options);
    expect(unchanged.toString()).toBe(added.toString());

    const removed = removeFeedFacet(
      new URLSearchParams("q=launch&page=2&f=market%3Apmkt_malaga&f=severity%3Aurgent"),
      { axis: "market", value: "pmkt_malaga" },
      options,
    );
    expect(removed.toString()).toBe("q=launch&f=severity%3Aurgent");
  });

  it("rejects malformed, cross-project, removed, and tampered tokens without selecting them", () => {
    const result = parseFeedFacets(
      {
        f: [
          "market:pmkt_malaga",
          "market:pmkt_other_project",
          "market:pmkt_archived",
          "language:klingon",
          "engine:other",
          "severity:",
          "unknown:value",
          "severity%ZZurgent",
          "severity:urgent:again",
          "severity:urgent",
          "severity:urgent",
        ],
      },
      options,
    );

    expect(result.facets).toEqual([
      { axis: "market", value: "pmkt_malaga" },
      { axis: "severity", value: "urgent" },
    ]);
    expect(result.rejected).toHaveLength(8);
    expect(result.rejected).toContain("market:pmkt_other_project");
    expect(result.rejected).toContain("market:pmkt_archived");
    expect(result.rejected).toContain("unknown:value");
  });

  it("rejects residual encoding instead of decoding a facet delimiter twice", () => {
    const result = parseFeedFacets({ f: ["market%3Apmkt_malaga", "market:pmkt_malaga"] }, options);

    expect(result.facets).toEqual([{ axis: "market", value: "pmkt_malaga" }]);
    expect(result.rejected).toEqual(["market%3Apmkt_malaga"]);
  });
});
