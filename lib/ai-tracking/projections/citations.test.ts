import { trackingSampleFixtures } from "@/components/ai-tracking/fixtures";
import { describe, expect, it } from "vitest";
import { trackingCitationGroups } from "./citations";

describe("retained citation aggregation", () => {
  it("deduplicates each URL within an answer while preserving distinct answer/revision drilldowns", () => {
    const first = trackingSampleFixtures[0];
    const rows = [
      {
        ...first,
        citations: [
          ...first.citations,
          { ...first.citations[0], url: `${first.citations[0].url}#section` },
        ],
      },
      {
        ...first,
        id: "asm_second",
        promptRevisionId: "apr_previous",
        prompt: "Previous exact revision",
      },
    ];
    const [group] = trackingCitationGroups(rows);
    expect(group).toMatchObject({ domain: "example.com", sampleCount: 2 });
    expect(group.urls).toHaveLength(1);
    expect(group.urls[0].samples.map((row) => row.promptRevisionId)).toEqual([
      "apr_neutral",
      "apr_previous",
    ]);
  });
  it("excludes malformed, executable and credential-bearing URLs rather than rendering links", () => {
    const row = {
      ...trackingSampleFixtures[0],
      citations: ["javascript:alert(1)", "not a URL", "https://user:pass@example.com/path"].map(
        (url) => ({ url, title: null, position: 1 }),
      ),
    };
    expect(trackingCitationGroups([row])).toEqual([]);
  });
});
