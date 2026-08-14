import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { describe, expect, it } from "vitest";
import {
  aggregateMarketGridRows,
  buildMarketGridViewRows,
  marketGridDefaultsToGrouped,
  selectedMarketTargetIds,
} from "./market-grid-model";

function target(overrides: Partial<KeywordRow> & { id: string }): KeywordRow {
  return {
    bestPosition: 4,
    clicks: null,
    cpc: "0.00",
    createdAt: "2026-08-01T00:00:00.000Z",
    ctr: null,
    device: "Desktop",
    difficulty: 32,
    difficultyKnown: true,
    engine: "Google",
    hasRankData: true,
    impressions: null,
    intent: null,
    keyword: "seo platform",
    lastCheckAt: "2026-08-13T12:00:00.000Z",
    lastCheckStatus: "completed",
    location: {
      canonicalKey: "country:us@en",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      id: "country:us@en",
      kind: "country",
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
    ...overrides,
    id: overrides.id,
  };
}

describe("market grid aggregate model", () => {
  it("uses best-current and best-prior positions across active targets", () => {
    const aggregate = aggregateMarketGridRows([
      target({ id: "us-desktop", position: 4, positionBaseline: 9 }),
      target({ id: "us-mobile", device: "Mobile", position: 6, positionBaseline: 3 }),
      target({ id: "es-desktop", position: 2, positionBaseline: 8 }),
    ])[0];

    expect(aggregate).toMatchObject({ activeTargetCount: 3, change: 1, position: 2 });
  });

  it("deduplicates volume by market pair while preserving an unsupported suffix", () => {
    const aggregate = aggregateMarketGridRows([
      target({ id: "us-desktop", volume: 1000 }),
      target({ id: "us-mobile", device: "Mobile", volume: 1000 }),
      target({
        id: "es-ar",
        location: {
          ...target({ id: "base" }).location,
          canonicalKey: "country:es@ar",
          countryCode: "ES",
          displayName: "Spain",
          gl: "es",
          hl: "ar",
          id: "country:es@ar",
        },
        volume: 0,
        volumeKnown: false,
      }),
    ])[0];

    expect(aggregate).toMatchObject({ hasPartiallyUnsupportedVolume: true, volume: 1000 });
  });

  it("returns no volume when every unique pair is unsupported", () => {
    const aggregate = aggregateMarketGridRows([
      target({ id: "one", volumeKnown: false }),
      target({ id: "two", device: "Mobile", volumeKnown: false }),
    ])[0];

    expect(aggregate?.volume).toBeNull();
  });

  it("shows mixed difficulty across pairs and one value across devices of one pair", () => {
    const onePair = aggregateMarketGridRows([
      target({ difficulty: 44, id: "one" }),
      target({ device: "Mobile", difficulty: 44, id: "two" }),
    ])[0];
    const twoPairs = aggregateMarketGridRows([
      target({ id: "one" }),
      target({
        id: "two",
        location: {
          ...target({ id: "base" }).location,
          canonicalKey: "country:es@es",
          countryCode: "ES",
          displayName: "Spain",
          gl: "es",
          hl: "es",
          id: "country:es@es",
        },
      }),
    ])[0];

    expect(onePair?.difficulty).toBe(44);
    expect(twoPairs?.difficulty).toBe("mixed");
  });

  it("excludes paused markets and retains stale active targets", () => {
    const aggregate = aggregateMarketGridRows(
      [
        target({ id: "active", lastCheckAt: "2026-08-10T00:00:00.000Z", position: 8 }),
        {
          ...target({ id: "paused", position: 1, volume: 9000 }),
          marketStatus: "paused" as const,
        },
      ],
      new Date("2026-08-14T00:00:00.000Z"),
    )[0];

    expect(aggregate).toMatchObject({
      activeTargetCount: 1,
      position: 8,
      stale: true,
      volume: 1000,
    });
  });

  it("keeps registry then device child order independent of parent sorting", () => {
    const aggregate = aggregateMarketGridRows([
      { ...target({ device: "Mobile", id: "later" }), registryOrder: 1 },
      { ...target({ id: "first" }), registryOrder: 0 },
      { ...target({ id: "last" }), registryOrder: 2 },
    ])[0];

    expect(aggregate?.children.map((child) => child.id)).toEqual(["first", "later", "last"]);
  });

  it("aggregates each sparkline point to the best position", () => {
    const aggregate = aggregateMarketGridRows([
      target({ id: "one", sparkline: [9, 7, 4] }),
      target({ id: "two", sparkline: [6, 8, 3] }),
    ])[0];

    expect(aggregate?.sparkline).toEqual([6, 7, 3]);
  });

  it("defaults to grouped only when at least two market pairs exist", () => {
    const one = target({ id: "one" });
    const two = target({
      id: "two",
      location: { ...one.location, canonicalKey: "country:es@es", id: "country:es@es" },
    });

    expect(marketGridDefaultsToGrouped([one])).toBe(false);
    expect(marketGridDefaultsToGrouped([one, two])).toBe(true);
  });

  it("flattens exactly two levels and expands children in fixed order", () => {
    const rows = [
      { ...target({ device: "Mobile", id: "mobile" }), registryOrder: 1 },
      { ...target({ id: "desktop" }), registryOrder: 0 },
    ];
    const collapsed = buildMarketGridViewRows(rows, true, new Set());
    const parentId = collapsed[0]?.id ?? "";
    const expanded = buildMarketGridViewRows(rows, true, new Set([parentId]));

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.marketGrid).toMatchObject({ expanded: false, kind: "parent" });
    expect(expanded.map((row) => row.id)).toEqual([parentId, "desktop", "mobile"]);
    expect(expanded[1]?.marketGrid).toEqual({ kind: "child", parentId });
  });

  it("maps a parent selection to every underlying target exactly once", () => {
    const rows = [target({ id: "desktop" }), target({ device: "Mobile", id: "mobile" })];
    const view = buildMarketGridViewRows(rows, true, new Set());

    expect(selectedMarketTargetIds(view, new Set([view[0]?.id ?? ""]))).toEqual([
      "desktop",
      "mobile",
    ]);
  });

  it("sorts parents by aggregates while retaining fixed child order", () => {
    const rows = [
      { ...target({ id: "alpha-mobile", keyword: "alpha", position: 8 }), registryOrder: 1 },
      { ...target({ id: "alpha-desktop", keyword: "alpha", position: 6 }), registryOrder: 0 },
      target({ id: "beta", keyword: "beta", position: 2 }),
    ];
    const collapsed = buildMarketGridViewRows(rows, true, new Set(), {
      field: "position",
      sort: "asc",
    });
    const alphaId = collapsed.find((row) => row.keyword === "alpha")?.id ?? "";
    const expanded = buildMarketGridViewRows(rows, true, new Set([alphaId]), {
      field: "position",
      sort: "asc",
    });

    expect(expanded.map((row) => row.id)).toEqual([
      expect.stringContaining("beta"),
      alphaId,
      "alpha-desktop",
      "alpha-mobile",
    ]);
  });
});
