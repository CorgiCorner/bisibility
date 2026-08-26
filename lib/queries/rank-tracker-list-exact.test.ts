import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import type { KeywordRow } from "./keyword-row-types";
import { exactRankTrackerRows } from "./rank-tracker-list-exact";

function row(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return {
    bestPosition: 4,
    clicks: 10,
    cpc: "1.00",
    dataAsOfAt: null,
    dataProvider: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ctr: 0.1,
    device: "Desktop",
    difficulty: 20,
    engine: "Google",
    hasRankData: true,
    id: "kw_base",
    impressions: 100,
    intent: "commercial",
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckErrorCode: null,
    lastCheckStatus: "completed",
    latestAttemptHealth: "ok",
    location: {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      id: "US",
      kind: "country",
    },
    locationName: "United States",
    position: 4,
    positionBaseline: 6,
    positionHistory: [],
    positionHistoryBoundaryAt: null,
    previousPosition: 6,
    rankingPages: 1,
    rankingPath: "/ranking",
    rankingUrl: "https://example.com/ranking?x=1",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 0,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: ["image"],
    sparkline: [6, 4],
    tags: ["A"],
    targetUrl: "/ranking/",
    topic: "Product",
    volume: 1000,
    ...overrides,
  };
}

describe("exact rank tracker candidates", () => {
  it("uses shared URL normalization and canonical feature aliases before pagination", () => {
    const equivalent = row();
    const mismatch = row({
      id: "kw_mismatch",
      rankingUrl: "https://example.com/other",
      serpFeatures: ["image"],
    });
    const result = exactRankTrackerRows([equivalent, mismatch], {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, serp: ["image"], wrongUrl: true },
    });
    expect(result.map((item) => item.id)).toEqual(["kw_mismatch"]);
  });

  it("treats no latest non-deferred attempt as not checked during exact filtering", () => {
    const unchecked = row({ id: "unchecked", lastCheckStatus: null });
    const completed = row({ id: "completed", lastCheckStatus: "completed" });
    const result = exactRankTrackerRows([unchecked, completed], {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, lastCheck: "not_checked" },
    });
    expect(result.map((item) => item.id)).toEqual(["unchecked"]);
  });

  it("sorts nulls explicitly and preserves source order for stable ties", () => {
    const rows = [
      row({ clicks: null, id: "null" }),
      row({ clicks: 2, createdAt: "2026-01-02T00:00:00.000Z", id: "newest" }),
      row({ clicks: 2, createdAt: "2026-01-01T00:00:00.000Z", id: "older" }),
    ];
    expect(
      exactRankTrackerRows(rows, {
        ...defaultRankTrackerQueryState,
        sort: { direction: "asc", field: "clicks" },
      }).map((item) => item.id),
    ).toEqual(["null", "newest", "older"]);
    expect(
      exactRankTrackerRows(rows, {
        ...defaultRankTrackerQueryState,
        sort: { direction: "desc", field: "clicks" },
      }).map((item) => item.id),
    ).toEqual(["newest", "older", "null"]);
  });
});
