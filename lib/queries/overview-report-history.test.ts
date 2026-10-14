import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { describe, expect, it } from "vitest";
import { overviewContributors } from "./overview-contributors";
import { buildOverviewReportHistory } from "./overview-report-history";
import type { Keyword } from "./overview-trend";

function keyword(
  id: string,
  position: number | null,
  at: string,
  completeThrough: number | null = 100,
): Keyword {
  const time = new Date(at);
  return {
    id,
    publicId: id,
    projectId: "project-a",
    text: `Synthetic ${id}`,
    device: "desktop",
    createdAt: new Date("2026-01-01"),
    schedule: null,
    _count: { rankChecks: 1 },
    locationRef: { displayName: "City A", languageCode: "en", languageLabel: "English" },
    rankChecks: [
      recordedFixture(position, {
        id: `check-${id}`,
        observedAt: time,
        recordedAt: time,
        completeThrough,
      }),
    ],
  };
}

describe("overview calendar history and contributions", () => {
  const options = {
    asOf: new Date("2026-10-12T12:00:00Z"),
    range: "7d" as const,
    timeZone: "Europe/Warsaw",
  };
  it("uses the unchanged Top20 oracle, fixed selected population and explicit unknown historical freshness", () => {
    const rows = [keyword("a", 1, "2026-10-12T10:00:00Z"), keyword("b", 2, "2026-10-12T10:00:00Z")];
    const result = buildOverviewReportHistory(
      rows,
      new Map([
        ["a", 1],
        ["b", 1],
      ]),
      options,
    );
    expect(result.days).toHaveLength(7);
    expect(result.days.at(-1)?.report.value).toBeCloseTo(78.33333333333333, 9);
    expect(result.days.at(-1)?.report).toMatchObject({
      dataCoverage: null,
      delta: null,
      counts: { expected: 2, metricEligible: 2 },
      freshness: "unknown",
    });
    expect(result.population).toBe("frozen_selected_targets");
    expect(result.days.at(-1)?.to).toBe(options.asOf.toISOString());
  });
  it("retains gaps instead of copying a prior observation into a new local day", () => {
    const history = buildOverviewReportHistory(
      [keyword("a", 5, "2026-10-10T12:00:00Z")],
      new Map(),
      options,
    );
    expect(history.days.find(({ id }) => id === "2026-10-10")?.report.value).not.toBeNull();
    expect(history.days.at(-1)?.report.value).toBeNull();
    expect(history.days.at(-1)?.averageRankedPosition).toBeNull();
  });
  it("uses the 25-hour Warsaw DST day and observed time rather than the mutable checkedAt label", () => {
    const history = buildOverviewReportHistory(
      [keyword("a", 3, "2026-10-24T22:15:00Z")],
      new Map(),
      { ...options, asOf: new Date("2026-10-26T12:00:00Z") },
    );
    const day = history.days.find(({ id }) => id === "2026-10-25");
    expect(day?.averageRankedPosition).toBe(3);
    expect(new Date(day!.to).getTime() - new Date(day!.from).getTime() + 1).toBe(25 * 3_600_000);
  });
  it("keeps unknown absence outside the metric denominator and retains its selected target", () => {
    const rows = [
      keyword("a", 1, "2026-10-12T10:00:00Z"),
      keyword("b", null, "2026-10-12T10:00:00Z", null),
    ];
    const report = buildOverviewReportHistory(rows, new Map(), options).days.at(-1)!.report;
    expect(report).toMatchObject({
      value: 100,
      observedCoverage: 0.5,
      counts: { expected: 2, metricEligible: 1, unknown: 1 },
    });
    const contributions = overviewContributors(rows, report);
    expect(contributions).toHaveLength(2);
    expect(contributions.find(({ id }) => id === "b")).toMatchObject({
      value: null,
      delta: null,
      status: "excluded",
    });
    expect(contributions.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(report.value);
  });
  it("does not invent a UTC calendar when report time zone is unavailable", () => {
    expect(buildOverviewReportHistory([], new Map(), { ...options, timeZone: null })).toMatchObject(
      {
        reason: "time_zone_unavailable",
        days: [],
      },
    );
  });
  it("does not turn a recorded timestamp into the missing SERP observation time", () => {
    const row = keyword("a", 1, "2026-10-12T10:00:00Z");
    row.rankChecks[0].observationRun!.requestPolicy = {
      evidence: { version: 1, observedAt: null },
    };
    const history = buildOverviewReportHistory([row], new Map(), options);
    expect(history.undatedChecks).toBe(1);
    expect(history.days.every(({ report }) => report.value === null)).toBe(true);
  });
  it("preserves all-zero weights as a null metric with no fabricated contribution", () => {
    const rows = [keyword("a", 1, "2026-10-12T10:00:00Z")];
    const report = buildOverviewReportHistory(rows, new Map([["a", 0]]), options).days.at(
      -1,
    )!.report;
    expect(report.value).toBeNull();
    expect(overviewContributors(rows, report)[0].value).toBeNull();
  });
});
