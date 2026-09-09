import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { describe, expect, it } from "vitest";
import {
  aggregateMarketGridRows,
  compareMarketGridAggregates,
  groupRow,
} from "./market-grid-model";

const baseTarget = {
  bestPosition: 4,
  clicks: null,
  cpc: "0.00",
  createdAt: "2026-08-01T00:00:00.000Z",
  ctr: null,
  dataAsOfAt: "2026-01-01T00:00:00.000Z",
  dataProvider: "primary",
  device: "Desktop",
  difficulty: 32,
  difficultyKnown: true,
  engine: "Google",
  hasRankData: true,
  id: "base",
  impressions: null,
  intent: null,
  keyword: "seo platform",
  lastCheckAt: "2026-08-13T12:00:00.000Z",
  lastCheckErrorCode: null,
  lastCheckStatus: "completed" as const,
  latestAttemptHealth: "ok" as const,
  location: {
    canonicalKey: "country:us@en",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "country:us@en",
    kind: "country" as const,
  },
  locationName: "United States / English",
  position: 4,
  positionBaseline: 7,
  positionHistory: [],
  positionHistoryBoundaryAt: null,
  previousPosition: 7,
  rankingPages: 1,
  rankingPath: "/seo",
  rankingUrl: "https://example.com/seo",
  rankingUrlHistory: [],
  schedule: {
    cron_expression: null,
    frequency: "daily",
    jitter_minutes: 0,
    last_checked_at: null,
    next_check_at: null,
    timezone: "UTC",
  },
  serpFeatures: [],
  sparkline: [9, 7, 4],
  tags: ["Core"],
  targetUrl: null,
  topic: null,
  volume: 1000,
  volumeKnown: true,
} satisfies KeywordRow;

function target(overrides: Partial<KeywordRow> & { id: string }): KeywordRow {
  return { ...baseTarget, ...overrides, id: overrides.id };
}

describe("market grid grouped sorting contract", () => {
  it("sorts parents by aggregates while retaining fixed child order", () => {
    const rows = [
      { ...target({ id: "alpha-mobile", keyword: "alpha", position: 8 }), registryOrder: 1 },
      { ...target({ id: "alpha-desktop", keyword: "alpha", position: 6 }), registryOrder: 0 },
      target({ id: "beta", keyword: "beta", position: 2 }),
    ];
    const grouped = aggregateMarketGridRows(rows)
      .sort((left, right) =>
        compareMarketGridAggregates(left, right, { direction: "asc", field: "position" }),
      )
      .map((aggregate) => groupRow(aggregate, aggregate.children));
    const alpha = grouped.find((row) => row.keyword === "alpha");

    expect(grouped.map((row) => row.id)).toEqual([expect.stringContaining("beta"), alpha?.id]);
    expect(alpha?.subRows?.map((row) => row.id)).toEqual(["alpha-desktop", "alpha-mobile"]);
  });

  it("sorts sparklines by the current aggregate position, not an older bucket", () => {
    const currentBest = aggregateMarketGridRows([
      target({ id: "current-best", position: 2, sparkline: [1, 20] }),
    ])[0];
    const historyBest = aggregateMarketGridRows([
      target({ id: "history-best", position: 8, sparkline: [1, 3] }),
    ])[0];
    if (!currentBest || !historyBest) throw new Error("Expected aggregates");

    expect(
      [historyBest, currentBest].sort((left, right) =>
        compareMarketGridAggregates(left, right, { direction: "asc", field: "sparkline" }),
      ),
    ).toEqual([currentBest, historyBest]);
  });

  it("keeps mixed difficulty groups after known values in both directions", () => {
    const known = aggregateMarketGridRows([target({ id: "known", difficulty: 10 })])[0];
    const mixed = aggregateMarketGridRows([
      target({ id: "mixed-us" }),
      target({
        id: "mixed-es",
        location: { ...baseTarget.location, canonicalKey: "es", id: "es" },
      }),
    ])[0];
    if (!known || !mixed) throw new Error("Expected aggregates");

    for (const direction of ["asc", "desc"] as const) {
      expect(
        [mixed, known].sort((left, right) =>
          compareMarketGridAggregates(left, right, { direction, field: "difficulty" }),
        ),
      ).toEqual([known, mixed]);
    }
  });

  it("sorts unknown difficulty after a known numeric zero in both directions", () => {
    const zero = aggregateMarketGridRows([
      target({ difficulty: 0, difficultyKnown: true, id: "zero", keyword: "beta" }),
    ])[0];
    const unknown = aggregateMarketGridRows([
      target({ difficulty: 0, difficultyKnown: false, id: "unknown", keyword: "straße" }),
    ])[0];
    if (!zero || !unknown) throw new Error("Expected aggregates");

    for (const direction of ["asc", "desc"] as const) {
      expect(
        [unknown, zero].sort((left, right) =>
          compareMarketGridAggregates(left, right, { direction, field: "difficulty" }),
        ),
      ).toEqual([zero, unknown]);
    }
  });
});
