import { describe, expect, it } from "vitest";
import { competitorSuggestionEvidence } from "./suggestion-evidence";

function keyword(text: string, domains: [string, number][], raw: unknown = null) {
  return {
    text,
    rankChecks: [
      { organicRanks: domains.map(([domain, position]) => ({ domain, position })), raw },
    ],
  };
}
const derive = (keywords: ReturnType<typeof keyword>[], excluded = new Set<string>()) =>
  competitorSuggestionEvidence("bisibility.com", keywords, excluded);

describe("competitorSuggestionEvidence", () => {
  it("includes results below a first-place site and does not require an own position", () => {
    expect(
      derive([
        keyword("rank tracker", [
          ["bisibility.com", 1],
          ["rival.com", 5],
        ]),
      ]),
    ).toEqual([
      { bestPosition: 5, domain: "rival.com", kind: "other", nonBrandSeenOn: 1, of: 1, seenOn: 1 },
    ]);
  });

  it("requires two distinct non-branded phrases and deduplicates devices and markets", () => {
    const same = keyword("rank tracker", [["rival.com", 3]]);
    const branded = keyword("bisibility rank tracker", [["rival.com", 2]]);
    expect(derive([same, same, branded])[0]).toMatchObject({
      kind: "other",
      nonBrandSeenOn: 1,
      seenOn: 2,
      of: 2,
    });
    expect(
      derive([same, same, branded, keyword("google rankings", [["rival.com", 4]])])[0],
    ).toMatchObject({ kind: "competitor", nonBrandSeenOn: 2, seenOn: 3, of: 3 });
  });

  it("recognizes whole brand tokens and punctuation without matching substrings", () => {
    expect(
      derive([
        keyword("BISIBILITY: rank tracker", [["rival.com", 2]]),
        keyword("bisibilitytools", [["rival.com", 3]]),
      ])[0],
    ).toMatchObject({ kind: "other", nonBrandSeenOn: 1 });
  });

  it("ranks distinct non-brand coverage before best position and branded recurrence", () => {
    expect(
      derive([
        keyword("rank tracker", [
          ["rival.com", 6],
          ["weak.com", 1],
        ]),
        keyword("google rankings", [["rival.com", 8]]),
        keyword("bisibility alternative", [["weak.com", 1]]),
        keyword("bisibility pricing", [["weak.com", 1]]),
      ]).map(({ domain }) => domain),
    ).toEqual(["rival.com", "weak.com"]);
  });

  it("keeps platforms separate even on several non-brand phrases", () => {
    const results = derive([
      keyword("rank tracker", [["github.com", 2]]),
      keyword("google rankings", [["github.com", 1]]),
    ]);
    expect(results[0]).toMatchObject({ kind: "platform", nonBrandSeenOn: 2 });
  });

  it("omits branded project listings but keeps a platform with other projects", () => {
    const raw = { organic_results: [{ url: "https://github.com/CorgiCorner/bisibility-sdk-go" }] };
    expect(derive([keyword("bisibility", [["github.com", 2]], raw)])).toEqual([]);
    raw.organic_results.push({ url: "https://github.com/another/rank-tracker" });
    expect(derive([keyword("bisibility", [["github.com", 2]], raw)])[0]).toMatchObject({
      domain: "github.com",
      kind: "platform",
    });
  });

  it("excludes own subdomains, managed and dismissed domains with their subdomains", () => {
    expect(
      derive(
        [
          keyword("rank tracker", [
            ["docs.bisibility.com", 1],
            ["www.rival.com", 2],
            ["help.dismissed.com", 3],
          ]),
        ],
        new Set(["rival.com", "dismissed.com"]),
      ),
    ).toEqual([]);
  });

  it("does not fabricate evidence for missing or malformed snapshots", () => {
    expect(
      competitorSuggestionEvidence(
        "bisibility.com",
        [
          { text: "rank tracker", rankChecks: [] },
          { text: "rank tracker", rankChecks: [{ organicRanks: {}, raw: null }] },
        ],
        new Set(),
      ),
    ).toEqual([]);
  });
});
