import { describe, expect, it } from "vitest";
import { buildTrendTakeaway, type Check, type Keyword } from "./overview-trend";

const now = new Date("2026-07-22T12:00:00.000Z");

function check(daysAgo: number, position: number): Check {
  return {
    checkedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    normalizationVersion: "v2",
    position,
    previousPosition: null,
    rankingUrl: null,
    requestedDepth: 100,
    status: "completed",
  };
}

function keyword(text: string, start: number, end: number, historyDays = 30): Keyword {
  const lastDay = historyDays - 1;
  return {
    _count: { rankChecks: 6 },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    device: "desktop",
    id: text,
    locationRef: { displayName: "United States", languageLabel: "English" },
    publicId: `kw_${text}`,
    rankChecks: [
      check(0, end),
      check(1, end),
      check(2, end),
      check(lastDay - 2, start),
      check(lastDay - 1, start),
      check(lastDay, start),
    ],
    schedule: null,
    text,
  };
}

describe("buildTrendTakeaway", () => {
  it("uses three-day bookends and click-volume tie-breaking for improvement", () => {
    const keywords = [
      keyword("headless cms", 5, 3),
      keyword("alpha", 10, 8),
      keyword("beta", 11, 9),
      keyword("gamma", 12, 10),
      keyword("delta", 13, 12),
    ];
    const volumes = new Map(keywords.map(({ id }) => [id, id === "headless cms" ? 200 : 100]));

    expect(buildTrendTakeaway(keywords, now, volumes)).toBe(
      "Avg position improved 1.8 in the last 30 days, led by 'headless cms'",
    );
  });

  it("renders worsening, flat, and short-history copy with unsigned one-decimal deltas", () => {
    expect(buildTrendTakeaway([keyword("react data grid", 4, 7)], now)).toBe(
      "Avg position slipped 3.0 in the last 30 days · biggest drop: 'react data grid'",
    );
    expect(buildTrendTakeaway([keyword("steady", 6, 6)], now)).toBe(
      "Avg position held steady over the last 30 days",
    );
    expect(buildTrendTakeaway([keyword("new", 9, 7, 10)], now)).toBe(
      "Avg position improved 2.0 in the first 10 days of tracking",
    );
    expect(buildTrendTakeaway([keyword("new", 7, 9, 10)], now)).toBe(
      "Avg position slipped 2.0 in the first 10 days of tracking",
    );
  });

  it("uses alphabetical order after equal movement and volume", () => {
    expect(
      buildTrendTakeaway(
        [keyword("zulu", 7, 5), keyword("alpha", 5, 3)],
        now,
        new Map([
          ["zulu", 100],
          ["alpha", 100],
        ]),
      ),
    ).toContain("led by 'alpha'");
  });

  it("hides the takeaway before seven days of tracking", () => {
    expect(buildTrendTakeaway([keyword("new", 9, 7, 6)], now)).toBeNull();
  });
});
