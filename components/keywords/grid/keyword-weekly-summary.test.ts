import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { buildKeywordWeeklySummary } from "./keyword-weekly-summary";

function row(
  keyword: string,
  positions: Array<{ checkedAt: string; position: number }>,
  clicks = 0,
) {
  return {
    clicks,
    keyword,
    positionHistory: positions.map((point) => ({ ...point, label: point.checkedAt })),
  } as KeywordRow;
}

const ago = (days: number) => `2026-07-${String(22 - days).padStart(2, "0")}T10:00:00.000Z`;

describe("buildKeywordWeeklySummary", () => {
  it("renders the standard variant and uses signed drop copy", () => {
    expect(
      buildKeywordWeeklySummary([
        row("headless cms", [
          { checkedAt: ago(8), position: 5 },
          { checkedAt: ago(0), position: 3 },
        ]),
        row("react data grid", [
          { checkedAt: ago(7), position: 4 },
          { checkedAt: ago(0), position: 6 },
        ]),
      ]),
    ).toEqual({
      sentence: "1 of 2 keywords improved this week · biggest drop: react data grid (-2)",
      tone: "improved",
    });
  });

  it.each([
    {
      expected: {
        sentence: "No keywords improved this week · biggest drop: docs (-2)",
        tone: "dropped",
      },
      positions: [[6, 8]],
    },
    {
      expected: { sentence: "1 of 1 keywords improved this week · no drops", tone: "improved" },
      positions: [[8, 6]],
    },
    {
      expected: { sentence: "Positions held steady this week", tone: "steady" },
      positions: [[6, 6]],
    },
  ])("renders every zero-state copy variant", ({ expected, positions }) => {
    expect(
      buildKeywordWeeklySummary(
        positions.map(([previous, current]) =>
          row("docs", [
            { checkedAt: ago(7), position: previous ?? 0 },
            { checkedAt: ago(0), position: current ?? 0 },
          ]),
        ),
      ),
    ).toEqual(expected);
  });

  it("uses clicks then alphabetical order for tied drops and hides without a baseline", () => {
    const tied = (keyword: string, clicks: number) =>
      row(
        keyword,
        [
          { checkedAt: ago(7), position: 4 },
          { checkedAt: ago(0), position: 6 },
        ],
        clicks,
      );
    expect(buildKeywordWeeklySummary([tied("alpha", 10), tied("zulu", 20)])?.sentence).toContain(
      "zulu (-2)",
    );
    expect(buildKeywordWeeklySummary([tied("alpha", 20), tied("zulu", 20)])?.sentence).toContain(
      "alpha (-2)",
    );
    expect(
      buildKeywordWeeklySummary([row("first week", [{ checkedAt: ago(0), position: 3 }])]),
    ).toBeNull();
  });
});
