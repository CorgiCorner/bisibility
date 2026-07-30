import {
  applyKeywordFilters,
  emptyKeywordFilters,
  getFilterChips,
  matchesKeywordSearch,
  removeFilterChip,
} from "@/lib/keywords/keyword-filter-model";
import { savedViewFiltersSchema } from "@/lib/keywords/saved-view-model";
import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { getFilterFacets } from "./keyword-filter-facets";

function loc(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
    ...overrides,
  };
}

function row(overrides: Partial<KeywordRow> = {}): KeywordRow {
  const location = overrides.location ?? loc();
  return {
    bestPosition: 1,
    cpc: "0.00",
    createdAt: "2026-01-01T00:00:00.000Z",
    device: "Desktop",
    difficulty: 0,
    engine: "Google",
    hasRankData: true,
    id: "kw_1",
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckStatus: null,
    location,
    locationName: location.displayName,
    position: 5,
    positionHistory: [],
    previousPosition: 5,
    rankingPages: 1,
    rankingPath: "/",
    rankingUrl: "https://example.com/",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 60,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: [],
    sparkline: [],
    tags: [],
    targetUrl: null,
    topic: null,
    intent: null,
    volume: 0,
    ...overrides,
    clicks: overrides.clicks ?? null,
    ctr: overrides.ctr ?? null,
    impressions: overrides.impressions ?? null,
    positionBaseline: overrides.positionBaseline === undefined ? 5 : overrides.positionBaseline,
  };
}

describe("topic and intent filters", () => {
  const rows = [
    row({ id: "product", intent: "commercial", topic: "Product" }),
    row({ id: "docs", intent: "informational", topic: "Docs" }),
    row({ id: "blank", intent: null, topic: null }),
  ];

  it("filters by selected topic or intent values", () => {
    expect(
      applyKeywordFilters(rows, { ...emptyKeywordFilters, topics: ["Docs"] }).map((r) => r.id),
    ).toEqual(["docs"]);
    expect(
      applyKeywordFilters(rows, { ...emptyKeywordFilters, intents: ["commercial"] }).map(
        (r) => r.id,
      ),
    ).toEqual(["product"]);
  });

  it("builds distinct topic and intent facets from loaded rows", () => {
    expect(getFilterFacets(rows).topics).toEqual([
      { count: 1, label: "Product" },
      { count: 1, label: "Docs" },
    ]);
    expect(getFilterFacets(rows).intents).toContainEqual({ count: 1, label: "commercial" });
  });

  it("searches topic and intent text", () => {
    expect(matchesKeywordSearch(rows[0], "commercial")).toBe(true);
    expect(matchesKeywordSearch(rows[1], "docs")).toBe(true);
  });

  it("searches target URLs", () => {
    expect(matchesKeywordSearch(row({ targetUrl: "/features/rank-tracking" }), "features")).toBe(
      true,
    );
  });

  it("adds and removes topic and intent chips", () => {
    const filters = { ...emptyKeywordFilters, intents: ["commercial"], topics: ["Product"] };
    expect(getFilterChips(filters)).toEqual(
      expect.arrayContaining([
        { key: "topic:Product", label: "Topic: Product" },
        { key: "intent:commercial", label: "Intent: commercial" },
      ]),
    );
    expect(removeFilterChip(filters, "topic:Product").topics).toEqual([]);
    expect(removeFilterChip(filters, "intent:commercial").intents).toEqual([]);
  });
});

describe("last check status filter", () => {
  const rows = [
    row({ id: "completed", lastCheckStatus: "completed" }),
    row({ id: "failed", lastCheckStatus: "failed" }),
    row({ id: "running", lastCheckStatus: "running" }),
    row({ id: "unchecked", lastCheckStatus: null }),
  ];

  it("matches only failed rows", () => {
    const result = applyKeywordFilters(rows, { ...emptyKeywordFilters, lastCheck: "failed" });
    expect(result.map((item) => item.id)).toEqual(["failed"]);
  });

  it("keeps null-status rows when set to any", () => {
    const result = applyKeywordFilters(rows, { ...emptyKeywordFilters, lastCheck: "any" });
    expect(result.map((item) => item.id)).toEqual(["completed", "failed", "running", "unchecked"]);
  });

  it("adds and removes a last-check chip", () => {
    const filters = { ...emptyKeywordFilters, lastCheck: "failed" } as const;
    const chips = getFilterChips(filters);
    expect(chips).toContainEqual({ key: "lastCheck", label: "Last check: Failed" });
    const cleared = removeFilterChip(filters, "lastCheck");
    expect(cleared.lastCheck).toBe("any");
  });
});

describe("combined keyword filters", () => {
  it("classifies a first observed ranking as new instead of improved", () => {
    const firstObservation = row({ position: 4, positionBaseline: null, previousPosition: 4 });

    expect(
      applyKeywordFilters([firstObservation], { ...emptyKeywordFilters, change: "new" }),
    ).toEqual([firstObservation]);
    expect(
      applyKeywordFilters([firstObservation], { ...emptyKeywordFilters, change: "up" }),
    ).toEqual([]);
  });

  it("covers position, movement, volume, SERP aliases, tags, text, and wrong URLs", () => {
    const candidate = row({
      keyword: "Best rank tracker",
      position: 12,
      positionBaseline: 20,
      previousPosition: 20,
      rankingPages: 2,
      rankingUrl: "https://example.com/blog/rank-tracker",
      serpFeatures: ["images"],
      tags: ["Core"],
      targetUrl: "https://example.com/features/rank-tracker",
      volume: 15_000,
    });
    expect(
      applyKeywordFilters([candidate], {
        ...emptyKeywordFilters,
        change: "up",
        contains: "RANK",
        position: ["11-50"],
        serp: ["image"],
        tags: ["Core"],
        volMax: 20,
        volMin: 10,
        wrongUrl: true,
        urlChanged: true,
      }),
    ).toEqual([candidate]);
    expect(
      applyKeywordFilters([row({ position: 2 }), row({ position: 70 })], {
        ...emptyKeywordFilters,
        position: ["top3", "51-100"],
      }),
    ).toHaveLength(2);
  });

  it("classifies movement from the earlier-day baseline after a same-day rerun", () => {
    const rerun = row({ position: 6, positionBaseline: 4, previousPosition: 6 });

    expect(applyKeywordFilters([rerun], { ...emptyKeywordFilters, change: "down" })).toEqual([
      rerun,
    ]);
    expect(applyKeywordFilters([rerun], { ...emptyKeywordFilters, change: "any" })).toEqual([
      rerun,
    ]);
    expect(applyKeywordFilters([rerun], { ...emptyKeywordFilters, change: "up" })).toEqual([]);
  });

  it("builds and removes remaining chip variants", () => {
    const filters = {
      ...emptyKeywordFilters,
      change: "up" as const,
      contains: "rank",
      position: ["top3" as const],
      serp: ["custom"],
      tags: ["Core"],
      volMax: 50,
      volMin: 10,
      wrongUrl: true,
      urlChanged: true,
    };
    expect(getFilterChips(filters).map((chip) => chip.key)).toEqual(
      expect.arrayContaining([
        "position",
        "change",
        "volume",
        "contains",
        "tag:Core",
        "serp:custom",
        "wrongUrl",
        "urlChanged",
      ]),
    );
    expect(removeFilterChip(filters, "serp:custom").serp).toEqual([]);
    expect(removeFilterChip(filters, "volume")).toMatchObject({ volMin: 0, volMax: 50 });
    expect(removeFilterChip(filters, "urlChanged").urlChanged).toBe(false);
    expect(removeFilterChip(filters, "unknown")).toBe(filters);
  });
});

describe("savedViewFiltersSchema backward compatibility", () => {
  it("strips legacy scoped filter keys while preserving content filters", () => {
    const parsed = savedViewFiltersSchema.parse({
      city: "Austin",
      country: "de",
      device: "mobile",
      position: ["top10"],
    });
    expect("city" in parsed).toBe(false);
    expect("country" in parsed).toBe(false);
    expect("device" in parsed).toBe(false);
    expect(parsed.position).toEqual(["top10"]);
    expect(parsed.topics).toEqual([]);
    expect(parsed.intents).toEqual([]);
    expect(parsed.lastCheck).toBe("any");
    expect(parsed.urlChanged).toBe(false);
  });

  it("round-trips topic and intent refinements", () => {
    const parsed = savedViewFiltersSchema.parse({
      intents: ["commercial"],
      topics: ["Product"],
    });
    expect(parsed.intents).toEqual(["commercial"]);
    expect(parsed.topics).toEqual(["Product"]);
  });
});
