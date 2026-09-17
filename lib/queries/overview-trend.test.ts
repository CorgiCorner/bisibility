import { describe, expect, it } from "vitest";
import { buildTrend, buildTrendTakeaway, type Check, type Keyword } from "./overview-trend";

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

    expect(buildTrendTakeaway(keywords, now, volumes)).toEqual({
      days: 30,
      kind: "improved",
      leader: "headless cms",
      value: 1.8,
      window: "lastThirtyDays",
    });
  });

  it("returns worsening, flat, and short-history semantic states", () => {
    expect(buildTrendTakeaway([keyword("react data grid", 4, 7)], now)).toEqual({
      days: 30,
      kind: "slipped",
      leader: "react data grid",
      value: 3,
      window: "lastThirtyDays",
    });
    expect(buildTrendTakeaway([keyword("steady", 6, 6)], now)).toEqual({
      days: 30,
      kind: "steady",
      window: "lastThirtyDays",
    });
    expect(buildTrendTakeaway([keyword("new", 9, 7, 10)], now)).toEqual({
      days: 10,
      kind: "improved",
      value: 2,
      window: "firstTrackedDays",
    });
    expect(buildTrendTakeaway([keyword("new", 7, 9, 10)], now)).toEqual({
      days: 10,
      kind: "slipped",
      value: 2,
      window: "firstTrackedDays",
    });
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
    ).toMatchObject({ leader: "alpha" });
  });

  it("hides the takeaway before seven days of tracking", () => {
    expect(buildTrendTakeaway([keyword("new", 9, 7, 6)], now)).toBeNull();
  });
});

describe("buildTrend", () => {
  it("preserves UTC calendar keys for client-side locale formatting", () => {
    const trend = buildTrend([keyword("calendar key", 4, 2, 10)]);

    expect(trend.map((point) => point.dateKey)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ]);
    expect(trend.at(-1)?.label).toBeNull();
  });
});
