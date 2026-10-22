import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import { keywordLocationRelation } from "@/lib/queries/keyword-location-test-fixtures";
import type { Metrics } from "@/lib/queries/keyword-metrics";
import { type KeywordTrafficSummary, mapKeyword } from "@/lib/queries/keyword-row";
import { pathFromUrl } from "@/lib/queries/keyword-row-format";
import type { KeywordTrafficDetail } from "@/lib/queries/keyword-traffic";
import { dateFromFrozenNow } from "@/tests/clock";
import { afterEach, describe, expect, it, vi } from "vitest";

const metrics: Metrics = { cpc: null, difficulty: null, serpFeatures: [], volume: null };
const project = { defaults: null, domain: "example.com" };
const noTraffic: KeywordTrafficDetail = {
  hasAnalyticsConnection: false,
  hasSearchConsoleConnection: false,
  pages: [],
  query: null,
};

function keywordRow() {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    locationRef: keywordLocationRelation,
    publicId: "kw_1",
    rankChecks: [],
    schedule: null,
    tags: [],
    targetUrl: "https://example.com/target",
    text: "rank tracker",
    topic: null,
  };
}

type RankCheck = Parameters<typeof mapKeyword>[0]["rankChecks"][number];

function rankCheck(
  checkedAt: string,
  id: string,
  position: number | null,
  overrides: Partial<RankCheck> = {},
): RankCheck {
  return {
    checkedAt: new Date(checkedAt),
    id,
    errorCode: null,
    normalizationVersion: "v2",
    position,
    provider: "primary",
    previousPosition: null,
    rankingUrl: "https://example.com/rank",
    requestedDepth: 100,
    status: "completed",
    ...overrides,
  };
}

describe("mapKeyword traffic fields", () => {
  it("retains legacy recorded history across depth changes without claiming qualified comparisons", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-03T10:00:00.000Z", "check_50", null, { requestedDepth: 50 }),
          rankCheck("2026-07-02T10:00:00.000Z", "check_20", 5, { requestedDepth: 20 }),
          rankCheck("2026-07-01T10:00:00.000Z", "check_legacy", 6, {
            normalizationVersion: null,
            requestedDepth: null,
          }),
        ],
      },
      project,
      metrics,
    );
    expect(row.positionObservations.map((point) => point.position)).toEqual([6, 5, null]);
    expect(row.completedComparableChecks).toEqual([]);
    expect(row.positionBaseline).toBeNull();
    expect(row.trackedDepth).toBe(50);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses null traffic values when no snapshot is available", () => {
    const row = mapKeyword(keywordRow(), project, metrics);

    expect(row.clicks).toBeNull();
    expect(row.impressions).toBeNull();
    expect(row.ctr).toBeNull();
    expect(row.trafficDate).toBeUndefined();
  });

  it("exposes the project time zone independently of the keyword override", () => {
    const defaults = {
      cronExpression: null,
      frequency: "daily" as const,
      jitterMinutes: 15,
      lastCheckedAt: null,
      nextCheckAt: null,
      timezone: "Europe/Warsaw",
    };
    const row = mapKeyword(
      { ...keywordRow(), schedule: { ...defaults, timezone: "UTC" } },
      { ...project, defaults },
      metrics,
    );
    expect(row.projectTimezone).toBe("Europe/Warsaw");
    expect(row.schedule.timezone).toBe("Europe/Warsaw");
  });

  it("maps the assigned CheckSchedule and keeps an unassigned keyword manual", () => {
    const scheduled = mapKeyword(
      {
        ...keywordRow(),
        checkSchedule: { name: "Daily 06:00", publicId: "sch_daily" },
      },
      project,
      metrics,
    );
    const manual = mapKeyword(keywordRow(), project, metrics);

    expect(scheduled.checkSchedule).toEqual({
      name: "Daily 06:00",
      nextCheckAt: null,
      publicId: "sch_daily",
    });
    expect(manual.checkSchedule).toBeNull();
  });

  it.each([null, 50] as const)(
    "shows the assigned schedule depth %s instead of the legacy keyword depth",
    (serpDepth) => {
      const row = mapKeyword(
        {
          ...keywordRow(),
          checkSchedule: { name: "Daily 06:00", publicId: "sch_daily", serpDepth },
          schedule: {
            cronExpression: null,
            frequency: "daily",
            jitterMinutes: 0,
            lastCheckedAt: null,
            nextCheckAt: null,
            serpDepth: 100,
            timezone: "UTC",
          },
        },
        project,
        metrics,
      );
      expect(row.schedule.serp_depth).toBe(serpDepth);
    },
  );

  it("keeps historical URL judgment on the recorded expected URL", () => {
    const historical = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_snapshot", 3, {
            expectedUrlAtCheck: "https://example.com/a",
            rankingUrl: "https://example.com/a",
          }),
        ],
        targetUrl: "https://example.com/b",
      },
      project,
      metrics,
    );
    const legacy = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [rankCheck("2026-07-02T10:00:00.000Z", "check_legacy", 3)],
        targetUrl: "https://example.com/b",
      },
      project,
      metrics,
    );

    expect(historical).toMatchObject({
      expectedUrl: "https://example.com/a",
      expectedUrlFallbackCurrent: false,
    });
    expect(legacy).toMatchObject({
      expectedUrl: "https://example.com/b",
      expectedUrlFallbackCurrent: true,
    });
  });

  it("maps populated traffic snapshot values", () => {
    const traffic: KeywordTrafficSummary = {
      clicks: 19,
      ctr: 0.0475,
      date: new Date("2026-06-30T00:00:00.000Z"),
      impressions: 400,
      provider: "gsc",
    };

    const row = mapKeyword(keywordRow(), project, metrics, traffic);

    expect(row.clicks).toBe(19);
    expect(row.impressions).toBe(400);
    expect(row.ctr).toBe(0.0475);
    expect(row.trafficDate).toBe("2026-06-30T00:00:00.000Z");
  });

  it("reuses the newest enabled positional rank alert as the target position", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        alertTargets: [
          {
            rule: {
              conditionType: "threshold",
              enabled: false,
              thresholdPosition: 2,
              topN: null,
              updatedAt: new Date("2026-07-20T10:00:00.000Z"),
            },
          },
          {
            rule: {
              conditionType: "exits_top_n",
              enabled: true,
              thresholdPosition: null,
              topN: 3,
              updatedAt: new Date("2026-07-19T10:00:00.000Z"),
            },
          },
        ],
      },
      project,
      metrics,
    );

    expect(row.targetPosition).toBe(3);
  });

  it("keeps the previous position null for a first completed observation", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [rankCheck("2026-07-01T10:00:00.000Z", "check_first", 1)],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({ position: 1, positionBaseline: null, previousPosition: null });
    expect(row.rankingUrlHistory).toEqual([
      {
        endAt: "2026-07-01T10:00:00.000Z",
        isCurrent: true,
        note: "First seen ranking",
        position: 1,
        requestedDepth: 100,
        startAt: "2026-07-01T10:00:00.000Z",
        url: "https://example.com/rank",
      },
    ]);
  });

  it("keeps an unproved legacy baseline unknown while retaining every dated observation", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-03T12:00:00.000Z", "check_latest", 6, { previousPosition: 6 }),
          rankCheck("2026-07-03T09:00:00.000Z", "check_same_day", 6, { previousPosition: 4 }),
          rankCheck("2026-07-01T10:00:00.000Z", "check_earlier_day", 4),
        ],
      },
      project,
      metrics,
    );

    expect(row.positionBaseline).toBeNull();
    expect(row.positionHistory).toEqual([]);
    expect(
      row.positionObservations.map(({ position, checkedAt }) => ({ position, checkedAt })),
    ).toEqual([
      { position: 4, checkedAt: "2026-07-01T10:00:00.000Z" },
      { position: 6, checkedAt: "2026-07-03T09:00:00.000Z" },
      { position: 6, checkedAt: "2026-07-03T12:00:00.000Z" },
    ]);
  });

  it("keeps malformed ranking URLs without applying project schedule defaults", () => {
    expect(pathFromUrl("http://[invalid")).toBe("http://[invalid");
    const defaults = {
      cronExpression: "0 9 * * *",
      frequency: "daily" as const,
      jitterMinutes: 5,
      lastCheckedAt: null,
      nextCheckAt: new Date("2026-07-12T09:00:00.000Z"),
      timezone: "UTC",
    };
    const row = mapKeyword(keywordRow(), { defaults, domain: "example.com" }, metrics);
    expect(row.scheduleSource).toBe("fallback");
    expect(row.schedule.frequency).toBe("manual");
  });

  it("does not invent next times for unassigned keywords", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00.000Z"));
    const defaults = {
      cronExpression: null,
      frequency: "daily" as const,
      jitterMinutes: 60,
      lastCheckedAt: null,
      nextCheckAt: null,
      timezone: "UTC",
    };
    const first = mapKeyword(
      { ...keywordRow(), id: "keyword_1", publicId: "kw_1" },
      { defaults, domain: "example.com" },
      metrics,
    );
    const second = mapKeyword(
      { ...keywordRow(), id: "keyword_2", publicId: "kw_2" },
      { defaults, domain: "example.com" },
      metrics,
    );

    expect(first.schedule.next_check_at).toBeNull();
    expect(second.schedule.next_check_at).toBeNull();
  });

  it("retains unqualified legacy observations without inventing a two-check comparable window", () => {
    const input = {
      ...keywordRow(),
      rankChecks: [
        rankCheck("2026-07-13T10:00:00.000Z", "check_deferred", null, { status: "deferred" }),
        rankCheck("2026-07-12T10:00:00.000Z", "check_running", 1, { status: "running" }),
        rankCheck(dateFromFrozenNow({ hours: 11 }).toISOString(), "check_failed", 2, {
          status: "failed",
        }),
        rankCheck(dateFromFrozenNow({ hours: -13 }).toISOString(), "check_latest", null, {
          rankingUrl: null,
        }),
        rankCheck("2026-07-09T10:00:00.000Z", "check_previous", 7, {
          rankingUrl: "https://example.com/previous",
        }),
        rankCheck("2026-07-08T10:00:00.000Z", "check_older", 9, {
          rankingUrl: "https://example.com/older",
        }),
        rankCheck("2026-07-07T10:00:00.000Z", "check_non_comparable", 3, {
          normalizationVersion: "v1",
          rankingUrl: "https://example.com/legacy",
        }),
      ],
    };

    const row = mapKeyword(input, project, metrics);

    expect(row.completedComparableChecks).toEqual([]);
    expect(row.positionObservations.map(({ position }) => position)).toEqual([3, 9, 7, null]);
    expect(row.positionBaseline).toBeNull();
  });

  it("keeps completed rank data when a newer attempt fails", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_failed", null, {
            errorCode: "request_failed",
            provider: "fallback",
            status: "failed",
          }),
          rankCheck("2026-07-01T10:00:00.000Z", "check_completed", 48, {
            provider: "primary",
          }),
        ],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({
      checkState: "failed",
      dataAsOfAt: "2026-07-01T10:00:00.000Z",
      dataProvider: "primary",
      hasRankData: true,
      lastCheckErrorCode: "request_failed",
      latestAttemptHealth: "failed",
      position: 48,
    });
  });

  it("keeps a completed not-ranked observation when a newer attempt fails", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_failed", null, {
            errorCode: "request_failed",
            status: "failed",
          }),
          rankCheck("2026-07-01T10:00:00.000Z", "check_completed", null),
        ],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({
      checkState: "failed",
      dataAsOfAt: "2026-07-01T10:00:00.000Z",
      hasRankData: true,
      latestAttemptHealth: "failed",
      position: 101,
    });
    expect(deriveKeywordDetailState(row, noTraffic)).toMatchObject({
      latestAttemptHealth: "failed",
      rankState: "not_ranked",
    });
  });

  it("reports failed health when no completed data exists", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_failed", null, {
            errorCode: "request_failed",
            status: "failed",
          }),
        ],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({
      dataAsOfAt: null,
      dataProvider: null,
      hasRankData: false,
      lastCheckErrorCode: "request_failed",
      latestAttemptHealth: "failed",
    });
    expect(deriveKeywordDetailState(row, noTraffic)).toMatchObject({
      latestAttemptHealth: "failed",
      rankState: "failed",
    });
  });

  it("reports running health when an active queued task exists", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        queuedRankCheckTasks: [{ state: "prepared" }],
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_failed", null, { status: "failed" }),
        ],
      },
      project,
      metrics,
    );

    expect(row.latestAttemptHealth).toBe("running");
  });

  it("keeps completed rank data while a newer attempt is running", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          rankCheck("2026-07-02T10:00:00.000Z", "check_running", null, { status: "running" }),
          rankCheck("2026-07-01T10:00:00.000Z", "check_completed", 48),
        ],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({
      dataAsOfAt: "2026-07-01T10:00:00.000Z",
      hasRankData: true,
      latestAttemptHealth: "running",
      position: 48,
    });
    expect(deriveKeywordDetailState(row, noTraffic)).toMatchObject({
      latestAttemptHealth: "running",
      rankState: "normal",
    });
  });

  it("keeps legacy URL history without drawing an unproved position segment", () => {
    const current = rankCheck("2026-07-03T10:00:00.000Z", "check_v2", 5, {
      rankingUrl: "https://example.com/current",
    });
    const legacy = {
      ...current,
      checkedAt: new Date("2026-07-01T10:00:00.000Z"),
      id: "check_v1",
      normalizationVersion: "v1",
      position: 2,
      rankingUrl: "https://example.com/legacy",
    };

    const segmented = mapKeyword(
      { ...keywordRow(), rankChecks: [current, legacy] },
      project,
      metrics,
    );
    const legacyOnly = mapKeyword({ ...keywordRow(), rankChecks: [legacy] }, project, metrics);

    expect(segmented).toMatchObject({
      bestPosition: null,
      position: 5,
      positionBaseline: null,
    });
    expect(segmented.positionHistory).toEqual([]);
    expect(segmented.positionObservations.map(({ position }) => position)).toEqual([2, 5]);
    expect(segmented.rankingUrlHistory).toMatchObject([
      {
        isCurrent: false,
        note: "First seen ranking",
        requestedDepth: 100,
        url: "https://example.com/legacy",
      },
      {
        isCurrent: true,
        note: "Current",
        requestedDepth: 100,
        url: "https://example.com/current",
      },
    ]);
    expect(legacyOnly.positionHistory).toEqual([]);
    expect(legacyOnly.positionObservations.map(({ position }) => position)).toEqual([2]);
  });
});

describe("persisted observation completeness", () => {
  it("keeps unknown coverage distinct from a completed absence", () => {
    const check = rankCheck("2026-07-01T10:00:00.000Z", "check_unknown", null, {
      observationRun: { completeness: "unknown" },
    });
    const row = mapKeyword({ ...keywordRow(), rankChecks: [check] }, project, metrics);
    expect(row).toMatchObject({ checkState: "unknown", observationCompleteness: "unknown" });
  });
});
