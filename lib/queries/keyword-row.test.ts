import type { Metrics } from "@/lib/queries/keyword-metrics";
import { type KeywordTrafficSummary, mapKeyword } from "@/lib/queries/keyword-row";
import { pathFromUrl } from "@/lib/queries/keyword-row-format";
import { dateFromFrozenNow } from "@/tests/clock";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    normalizationVersion: "v2",
    position,
    previousPosition: null,
    rankingUrl: "https://example.com/rank",
    requestedDepth: 100,
    status: "completed",
    ...overrides,
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

  it("uses the latest positive check from an earlier day as the position baseline", () => {
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

  it("maps only the latest two completed checks from the current comparable window", () => {
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

    expect(row.completedComparableChecks).toEqual([
      {
        checkedAt: "2026-07-09T10:00:00.000Z",
        position: 7,
        rankingUrl: "https://example.com/previous",
      },
      {
        checkedAt: dateFromFrozenNow({ hours: -13 }).toISOString(),
        position: null,
        rankingUrl: null,
      },
    ]);
  });

  it("keeps URL history across a comparison boundary while segmenting position history", () => {
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
      bestPosition: 5,
      position: 5,
      positionHistoryBoundaryAt: "2026-07-01T10:00:00.000Z",
    });
    expect(segmented.positionHistory).toHaveLength(1);
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
    expect(legacyOnly.positionHistoryBoundaryAt).toBeNull();
  });
});
