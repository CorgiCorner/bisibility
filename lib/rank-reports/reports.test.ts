import { describe, expect, it } from "vitest";
import type { ReportPageKey } from "./model";
import { pageRankReportRecords, recordInReportWindow } from "./page";
import { rankReportRecords } from "./records";
import {
  reportCheck,
  reportKeyword,
  reportPolicy,
  reportProject,
  reportRequest,
  reportTarget,
} from "./report-test-fixture";
import { selectResolvedRankReportTargets } from "./selection";
import { resolveRankReportTargets, summarizeRankReport } from "./summary";

describe("whole-scope reports and honest history", () => {
  it("keeps all 103 targets in the metric while display pages contain25 or50 records", () => {
    const policy = reportPolicy();
    const targets = Array.from({ length: 103 }, (_, i) => ({
      ...reportTarget(),
      id: `kw_a${String(i).padStart(23, "0")}`,
      checks: [reportCheck(2, { id: `check_a${String(i).padStart(23, "0")}` })],
    }));
    const summary = summarizeRankReport(
      resolveRankReportTargets(targets, policy, reportProject.id),
      policy,
    );
    const rows = rankReportRecords(targets, policy, reportProject.id).flatMap(({ observation }) =>
      observation ? [observation] : [],
    );
    const request = reportRequest();
    expect(summary.metric.counts.expected).toBe(103);
    expect(summary.metric.counts.ranked).toBe(103);
    expect(summary.metric.value).toBeCloseTo(50, 9);
    expect(summary.metric.delta).toBeNull();
    expect(pageRankReportRecords(rows, request, null)).toMatchObject({
      records: expect.any(Array),
      totalCount: 103,
    });
    expect(pageRankReportRecords(rows, request, null).records).toHaveLength(25);
    expect(pageRankReportRecords(rows, { ...request, pageLimit: 50 }, null).records).toHaveLength(
      50,
    );
    expect(summary.metric.includedCount).toBe(103);
    expect(summary.metric.isTruncated).toBe(false);
  });
  it("returns an entire101 observations in the window rather than the latest90 attempts", () => {
    const target = {
      ...reportTarget(),
      checks: Array.from({ length: 101 }, (_, i) =>
        reportCheck(2, { id: `check_a${String(i).padStart(23, "0")}` }),
      ),
    };
    const rows = rankReportRecords([target], reportPolicy(), reportProject.id).flatMap(
      ({ observation }) => (observation ? [observation] : []),
    );
    const ids: string[] = [];
    let last: ReportPageKey | null = null;
    do {
      const page: ReturnType<typeof pageRankReportRecords<(typeof rows)[number]>> =
        pageRankReportRecords(rows, reportRequest(), last);
      ids.push(...page.records.map(({ id }) => id));
      last = page.last;
      expect(page.totalCount).toBe(101);
    } while (last);
    expect(ids).toHaveLength(101);
    expect(new Set(ids).size).toBe(101);
  });
  it("preserves unknown legacy observation time and the URL at each check", () => {
    const old = reportCheck(3, {
      checkedAt: new Date("2026-10-12T11:00:00Z"),
      createdAt: new Date("2026-10-12T09:00:00Z"),
      observationRun: null,
      rankingUrl: "https://old.example.test/path",
    });
    const records = rankReportRecords(
      [{ ...reportTarget(), checks: [old] }],
      reportPolicy(),
      reportProject.id,
    );
    expect(records[0].observation).toMatchObject({
      evidence: "unknown",
      observedAt: null,
      rankingUrl: "https://old.example.test/path",
      recordedAt: "2026-10-12T09:00:00.000Z",
      reportedPosition: 3,
      position: null,
    });
    const page = pageRankReportRecords(
      records.flatMap(({ observation }) => (observation ? [observation] : [])),
      { ...reportRequest(), window: { ...reportRequest().window, basis: "observed_at" } },
      null,
    );
    expect(page).toMatchObject({ excludedUnknownTime: 1, records: [], totalCount: 0 });
  });
  it("keeps logical check creation separate from a later recorded observation", () => {
    const check = reportCheck(2, { createdAt: new Date("2026-10-12T09:00:00Z") });
    const record = rankReportRecords(
      [{ ...reportTarget(), checks: [check] }],
      reportPolicy(),
      reportProject.id,
    )[0];
    expect(record.attempt).toMatchObject({ recordedAt: "2026-10-12T09:00:00.000Z" });
    expect(record.observation).toMatchObject({
      checkRecordedAt: "2026-10-12T09:00:00.000Z",
      recordedAt: "2026-10-12T10:01:00.000Z",
    });
  });
  it("separates a failed attempt from qualified observations without making absence or zero movement", () => {
    const target = {
      ...reportTarget(),
      checks: [
        reportCheck(null, {
          id: "check_bbcdefghijklmnopqrstuvwx",
          observationRun: null,
          status: "failed",
        }),
      ],
    };
    const resolved = resolveRankReportTargets([target], reportPolicy(), reportProject.id);
    const records = rankReportRecords([target], reportPolicy(), reportProject.id);
    expect(records[0].attempt.status).toBe("failed");
    expect(records[0].observation).toBeNull();
    expect(summarizeRankReport(resolved, reportPolicy()).metric).toMatchObject({
      counts: { expected: 1, failed: 1, knownAbsent: 0 },
      delta: null,
      value: null,
    });
    expect(
      selectResolvedRankReportTargets(resolved, {
        evidence: "any",
        events: [],
        execution: "any",
        freshness: "any",
        movement: "up",
        position: null,
      }),
    ).toEqual([]);
  });
  it("uses actual timestamp comparisons even when ISO precision differs", () => {
    expect(
      recordInReportWindow(
        { id: reportKeyword, observedAt: null, recordedAt: "2026-10-12T12:00:00.000Z" },
        { basis: "recorded_at", from: "2026-10-12T12:00:00Z", to: "2026-10-12T12:00:00Z" },
      ),
    ).toBe(true);
  });
  it("does not produce a delta when comparison was not requested", () => {
    const policy = { ...reportPolicy(), baseline: { mode: "none" as const } };
    const summary = summarizeRankReport(
      resolveRankReportTargets([reportTarget()], policy, reportProject.id),
      policy,
    );
    expect(summary).toMatchObject({
      comparison: "not_requested",
      metric: { counts: { comparable: 0 }, delta: null },
      movementCounts: null,
    });
  });
  it("keeps a known zero weight distinct from missing volume without fabricating a zero metric", () => {
    const policy = reportPolicy();
    const summary = summarizeRankReport(
      resolveRankReportTargets([{ ...reportTarget(), volume: 0 }], policy, reportProject.id),
      policy,
    );
    expect(summary.metric).toMatchObject({
      counts: { ranked: 1 },
      delta: null,
      imputedWeightShare: null,
      value: null,
    });
  });
});
