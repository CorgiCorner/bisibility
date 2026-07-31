import { afterEach, describe, expect, it, vi } from "vitest";
import type { Metrics } from "./keyword-metrics";
import { type KeywordTrafficSummary, mapKeyword } from "./keyword-row";
import { pathFromUrl } from "./keyword-row-format";

const metrics: Metrics = { cpc: null, difficulty: null, serpFeatures: [], volume: null };
const project = { defaults: null, domain: "example.com" };

function keywordRow() {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    publicId: "kw_1",
    rankChecks: [],
    schedule: null,
    tags: [],
    targetUrl: "https://example.com/target",
    text: "rank tracker",
    topic: null,
  };
}

describe("mapKeyword traffic fields", () => {
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
        rankChecks: [
          {
            checkedAt: new Date("2026-07-01T10:00:00.000Z"),
            id: "check_first",
            normalizationVersion: "v2",
            position: 1,
            previousPosition: null,
            rankingUrl: "https://example.com/rank",
            requestedDepth: 100,
            status: "completed",
          },
        ],
      },
      project,
      metrics,
    );

    expect(row).toMatchObject({ position: 1, positionBaseline: null, previousPosition: null });
  });

  it("uses the latest positive check from an earlier day as the position baseline", () => {
    const row = mapKeyword(
      {
        ...keywordRow(),
        rankChecks: [
          {
            checkedAt: new Date("2026-07-03T12:00:00.000Z"),
            id: "check_latest",
            normalizationVersion: "v2",
            position: 6,
            previousPosition: 6,
            rankingUrl: "https://example.com/rank",
            requestedDepth: 100,
            status: "completed",
          },
          {
            checkedAt: new Date("2026-07-03T09:00:00.000Z"),
            id: "check_same_day",
            normalizationVersion: "v2",
            position: 6,
            previousPosition: 4,
            rankingUrl: "https://example.com/rank",
            requestedDepth: 100,
            status: "completed",
          },
          {
            checkedAt: new Date("2026-07-01T10:00:00.000Z"),
            id: "check_earlier_day",
            normalizationVersion: "v2",
            position: 4,
            previousPosition: null,
            rankingUrl: "https://example.com/rank",
            requestedDepth: 100,
            status: "completed",
          },
        ],
      },
      project,
      metrics,
    );

    expect(row.positionBaseline).toBe(4);
    expect(row.positionHistory).toEqual([
      { checkedAt: "2026-07-01T10:00:00.000Z", label: "Jul 1", position: 4 },
      { checkedAt: "2026-07-03T09:00:00.000Z", label: "Jul 3", position: 6 },
      { checkedAt: "2026-07-03T12:00:00.000Z", label: "Jul 3", position: 6 },
    ]);
  });

  it("keeps malformed ranking URLs and inherits project schedule defaults", () => {
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
    expect(row.scheduleSource).toBe("project");
    expect(row.schedule.frequency).toBe("daily");
  });

  it("derives keyword-specific next times for inherited interval defaults", () => {
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

    expect(first.schedule.next_check_at).not.toBeNull();
    expect(second.schedule.next_check_at).not.toBeNull();
    expect(first.schedule.next_check_at).not.toBe(second.schedule.next_check_at);
  });

  it("never treats deferred attempts as rank history or latest completed state", () => {
    const input = {
      ...keywordRow(),
      rankChecks: [
        {
          checkedAt: new Date("2026-07-02T10:00:00.000Z"),
          id: "check_deferred",
          normalizationVersion: null,
          position: null,
          previousPosition: null,
          rankingUrl: null,
          requestedDepth: 100,
          status: "deferred",
        },
        {
          checkedAt: new Date("2026-07-01T10:00:00.000Z"),
          id: "check_completed",
          normalizationVersion: "v2",
          position: 7,
          previousPosition: 9,
          rankingUrl: "https://example.com/rank",
          requestedDepth: 100,
          status: "completed",
        },
      ],
    };

    const row = mapKeyword(input, project, metrics);

    expect(row.lastCheckAt).toBe("2026-07-01T10:00:00.000Z");
    expect(row.lastCheckStatus).toBe("completed");
    expect(row.position).toBe(7);
    expect(row.positionHistory).toEqual([
      { checkedAt: "2026-07-01T10:00:00.000Z", label: "Jul 1", position: 7 },
    ]);
  });

  it("segments history and marks only a boundary inside the visible window", () => {
    const current = {
      checkedAt: new Date("2026-07-03T10:00:00.000Z"),
      id: "check_v2",
      normalizationVersion: "v2",
      position: 5,
      previousPosition: null,
      rankingUrl: "https://example.com/current",
      requestedDepth: 100,
      status: "completed",
    };
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
      bestPosition: 5,
      position: 5,
      positionHistoryBoundaryAt: "2026-07-01T10:00:00.000Z",
    });
    expect(segmented.positionHistory).toHaveLength(1);
    expect(legacyOnly.positionHistoryBoundaryAt).toBeNull();
  });
});
