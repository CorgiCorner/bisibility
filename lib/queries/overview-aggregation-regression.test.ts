import { describe, expect, it } from "vitest";
import { buildHighlights, buildOverviewMetrics, snapshotFor } from "./overview-builders";
import { buildTrend, buildTrendTakeaway, type Check, type Keyword } from "./overview-trend";

const now = new Date("2026-07-22T12:00:00Z");
function check(daysAgo: number, position: number | null, hour = 12): Check {
  const checkedAt = new Date(now.getTime() - daysAgo * 86_400_000);
  checkedAt.setUTCHours(hour);
  return {
    checkedAt,
    position,
    previousPosition: null,
    normalizationVersion: "v2",
    requestedDepth: 100,
    rankingUrl: position === null ? null : "https://example.com/",
    status: "completed",
  };
}
function keyword(rankChecks: Check[]): Keyword {
  return {
    id: "kw_audit",
    publicId: "kw_audit",
    text: "example keyword",
    createdAt: new Date("2026-01-01"),
    device: "desktop",
    locationRef: { displayName: "Example", languageLabel: "English" },
    _count: { rankChecks: rankChecks.length },
    rankChecks,
    schedule: null,
  };
}
describe("overview latest daily observation regressions", () => {
  it("clears a prior top-ten rank from headline metrics after a completed not-found observation", () => {
    const row = keyword([check(0, null), check(1, 3)]);
    const snapshot = snapshotFor(row);
    const metrics = buildOverviewMetrics([snapshot]);
    const trend = buildTrend([row]);
    const attention = buildHighlights([snapshot], now).find((list) => list.kind === "attention");
    expect(metrics).toMatchObject({
      averagePosition: null,
      top10Count: 0,
      top100Count: 0,
      visibility: 0,
    });
    expect(trend.at(-1)?.value).toBeNull();
    expect(attention?.rows[0]).toMatchObject({ position: null, positionState: "notRanked" });
  });
  it("reports steady ranks when repeated early-day checks leave latest daily ranks unchanged", () => {
    const repeatedStart = [29, 28, 27].flatMap((day) => [check(day, 10, 12), check(day, 100, 9)]);
    const row = keyword([check(0, 10), check(1, 10), check(2, 10), ...repeatedStart]);
    expect(buildTrend([row]).map((point) => point.value)).toEqual([10, 10, 10, 10, 10, 10]);
    expect(buildTrendTakeaway([row], now)).toMatchObject({
      kind: "steady",
      window: "lastThirtyDays",
    });
  });
});

it.each(["unknown", "truncated_by_stop_on_match"])(
  "discloses %s coverage in dashboard attention without claiming absence",
  (completeness) => {
    const row = keyword([{ ...check(0, null), observationRun: { completeness } }, check(1, 3)]);
    const snapshot = snapshotFor(row);
    const attention = buildHighlights([snapshot], now).find((list) => list.kind === "attention");
    expect(attention?.rows[0]).toMatchObject({
      positionState: "noData",
      note: { kind: "coverageUnknown" },
    });
  },
);
