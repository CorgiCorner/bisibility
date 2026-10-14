import { makePublicId } from "@/lib/db/public-id";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import { describe, expect, it } from "vitest";
import { rankTrackerQualityRowMatches } from "./rank-tracker-report-filter";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";
import {
  rankTrackerQualityFixture,
  reportCheck,
  reportPolicy,
} from "./rank-tracker-report-test-fixture";

describe("120-target shared General cohort", () => {
  it("computes 60 independent comparable pairs and 11 improvements before slicing any page", () => {
    const policy = reportPolicy();
    const values = Array.from({ length: 120 }, (_, index) => {
      const current = reportCheck(2, { id: makePublicId("check") });
      const date = new Date("2026-09-30T10:01:00.000Z"),
        baseline = reportCheck(index < 11 ? 3 : 2, {
          id: makePublicId("check"),
          checkedAt: date,
          createdAt: date,
          updatedAt: date,
        });
      if (!baseline.observationRun) throw new Error("Missing fixture observation");
      baseline.observationRun = {
        ...baseline.observationRun,
        createdAt: date,
        executedAt: date,
        requestPolicy: {
          evidence: {
            completeThrough: { organic_result: 100 },
            observedAt: "2026-09-30T10:00:00.000Z",
            policyRevision: "policy-v1",
            targetRevision: "target-v1",
            version: 1,
          },
        },
      };
      return rankTrackerQualityFixture(
        {
          id: makePublicId("kw"),
          volume: 100,
          checks: index < 60 ? [current, baseline] : [current],
        },
        policy,
      );
    });
    const rows = sortRankTrackerQualityRows(
      values.map((value) => value.row),
      defaultRankTrackerQueryState.sort,
    );
    const report = summarizeRankReport(
      values.map((value) => value.resolution),
      policy,
    );
    expect(report.metric.counts.expected).toBe(120);
    expect(report.metric.counts.comparable).toBe(60);
    expect(
      rows.filter((row) =>
        rankTrackerQualityRowMatches(row, {
          ...defaultRankTrackerQueryState,
          filters: { ...defaultRankTrackerQueryState.filters, change: "up" },
        }),
      ),
    ).toHaveLength(11);
    expect(rows.slice(0, 50)).toHaveLength(50);
    expect(rows.slice(100, 150)).toHaveLength(20);
    expect(values.filter((value) => value.row.rankQuality.movement !== null)).toHaveLength(60);
  });
});
