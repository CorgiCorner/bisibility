import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { rankTrackerQualityRowMatches } from "./rank-tracker-report-filter";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";
import {
  rankTrackerQualityFixture,
  reportCheck,
  reportTarget,
} from "./rank-tracker-report-test-fixture";

function capturedRow(expectedUrl: string | null, targetUrl: string, id: string) {
  const { row } = rankTrackerQualityFixture({
    ...reportTarget(),
    id,
    checks: [reportCheck(2, { expectedUrlAtCheck: expectedUrl })],
  });
  return { ...row, expectedUrl, targetUrl };
}

describe("qualified table expected URL parity", () => {
  it("searches the captured displayed expectation and excludes a subsequently edited target", () => {
    const row = capturedRow(
      "https://example.test/captured-target",
      "https://example.test/new-edit",
      "kw_abcdefghijklmnopqrstuvwx",
    );
    expect(
      rankTrackerQualityRowMatches(row, {
        ...defaultRankTrackerQueryState,
        search: "captured-target",
      }),
    ).toBe(true);
    expect(
      rankTrackerQualityRowMatches(row, { ...defaultRankTrackerQueryState, search: "new-edit" }),
    ).toBe(false);
  });

  it("does not rescue a missing captured expectation with today's mutable target", () => {
    const row = capturedRow(null, "https://example.test/new-edit", "kw_abcdefghijklmnopqrstuvwx");
    expect(
      rankTrackerQualityRowMatches(row, { ...defaultRankTrackerQueryState, search: "new-edit" }),
    ).toBe(false);
  });

  it.each(["asc", "desc"] as const)(
    "sorts target/ranking by the displayed expectation in %s order",
    (direction) => {
      const first = capturedRow(
        "https://example.test/a-captured",
        "https://example.test/z-edit",
        "kw_abcdefghijklmnopqrstuvwx",
      );
      const second = capturedRow(
        "https://example.test/z-captured",
        "https://example.test/a-edit",
        "kw_bbcdefghijklmnopqrstuvwx",
      );
      expect(
        sortRankTrackerQualityRows([second, first], { field: "targetRanking", direction }).map(
          ({ id }) => id,
        ),
      ).toEqual(direction === "asc" ? [first.id, second.id] : [second.id, first.id]);
    },
  );

  it.each(["asc", "desc"] as const)(
    "keeps an unknown expected/ranking URL after known URLs in %s order",
    (direction) => {
      const known = capturedRow(
        "https://example.test/captured",
        "https://example.test/new-edit",
        "kw_abcdefghijklmnopqrstuvwx",
      );
      const unknown = {
        ...capturedRow(null, "https://example.test/current-only", "kw_bbcdefghijklmnopqrstuvwx"),
        rankingUrl: null,
      };
      expect(
        sortRankTrackerQualityRows([unknown, known], { field: "targetRanking", direction }).map(
          ({ id }) => id,
        ),
      ).toEqual([known.id, unknown.id]);
    },
  );
});
