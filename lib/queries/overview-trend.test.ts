import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { describe, expect, it } from "vitest";
import { buildTrend, buildTrendTakeaway, type Check, type Keyword } from "./overview-trend";

const now = new Date("2026-07-22T12:00:00.000Z");

function check(daysAgo: number, position: number): Check {
  const at = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    ...recordedFixture(position, { id: `at-${at.toISOString()}`, observedAt: at, recordedAt: at }),
    rankingUrl: null,
  };
}

function keyword(text: string, start: number, end: number, historyDays = 30): Keyword {
  const lastDay = historyDays - 1;
  return {
    _count: { rankChecks: 6 },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    device: "desktop",
    id: `kw_${text}`,
    projectId: "project-a",
    locationRef: { displayName: "United States", languageLabel: "English" },
    publicId: `kw_${text}`,
    rankChecks: [
      check(0, end),
      check(1, end),
      check(2, end),
      check(lastDay - 2, start),
      check(lastDay - 1, start),
      check(lastDay, start),
    ].map((value) => {
      const scope = { ...fixtureScope, targetId: `kw_${text}`, location: "United States" };
      return {
        ...value,
        observationRun: value.observationRun
          ? { ...value.observationRun, configuredScope: scope, effectiveScope: scope }
          : null,
      };
    }),
    schedule: null,
    text,
  };
}

function captured(id: string, checks: Check[]): Check[] {
  const scope = { ...fixtureScope, targetId: id, location: "United States" };
  return checks.map((value) => ({
    ...value,
    observationRun: value.observationRun
      ? { ...value.observationRun, configuredScope: scope, effectiveScope: scope }
      : null,
  }));
}

describe("buildTrendTakeaway", () => {
  it("uses captured comparable positive pairs and click-volume tie-breaking for improvement", () => {
    const keywords = [
      keyword("headless cms", 5, 3),
      keyword("alpha", 10, 8),
      keyword("beta", 11, 9),
      keyword("gamma", 12, 10),
      keyword("delta", 13, 12),
    ];
    const volumes = new Map(keywords.map(({ id }) => [id, id === "kw_headless cms" ? 200 : 100]));

    expect(buildTrendTakeaway(keywords, now, volumes)).toEqual({
      days: 30,
      kind: "improved",
      leader: "headless cms",
      value: 1.8,
      window: "lastThirtyDays",
      comparableCount: 5,
    });
  });

  it("returns worsening, flat, and short-history semantic states", () => {
    expect(buildTrendTakeaway([keyword("react data grid", 4, 7)], now)).toEqual({
      days: 30,
      kind: "slipped",
      leader: "react data grid",
      value: 3,
      comparableCount: 1,
      window: "lastThirtyDays",
    });
    expect(buildTrendTakeaway([keyword("steady", 6, 6)], now)).toEqual({
      days: 30,
      kind: "steady",
      comparableCount: 1,
      window: "lastThirtyDays",
    });
    expect(buildTrendTakeaway([keyword("new", 9, 7, 10)], now)).toEqual({
      days: 10,
      kind: "improved",
      value: 2,
      comparableCount: 1,
      window: "firstTrackedDays",
    });
    expect(buildTrendTakeaway([keyword("new", 7, 9, 10)], now)).toEqual({
      days: 10,
      kind: "slipped",
      value: 2,
      comparableCount: 1,
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
  it("keeps recorded days after a depth change and leaves unranked days as gaps", () => {
    const row = keyword("rank tracker", 6, 5);
    row.rankChecks = [
      { ...check(0, 1), position: null, requestedDepth: 50 },
      { ...check(1, 5), requestedDepth: 20 },
      { ...check(2, 6), requestedDepth: null, normalizationVersion: null },
    ];
    row.rankChecks = captured(row.publicId, row.rankChecks);
    const trend = buildTrend([row]);
    expect(trend.map((point) => point.value)).toEqual([null, 5, null]);
    expect(buildTrendTakeaway([row], now)).toBeNull();
  });

  it("weights each keyword once per day using its latest completed observation", () => {
    const first = keyword("first", 6, 5);
    first.rankChecks = [
      check(0, 10),
      { ...check(0, 1), checkedAt: new Date("2026-07-22T09:00:00Z") },
    ];
    const second = keyword("second", 6, 5);
    second.rankChecks = [check(0, 20)];
    first.rankChecks = captured(first.publicId, first.rankChecks);
    second.rankChecks = captured(second.publicId, second.rankChecks);
    expect(buildTrend([first, second]).at(-1)?.value).toBe(15);
  });
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
    expect(trend.at(-1)?.label).toBe("2026-07-22");
  });
});
