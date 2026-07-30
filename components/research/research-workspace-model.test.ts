import { describe, expect, it } from "vitest";
import {
  actualResearchCostCents,
  mapWithConcurrency,
  markTabsSaved,
  nextBudgetResetLabel,
  recentSearchLocation,
  recentSearchReplay,
  researchFailureState,
  researchRetryLabel,
  researchSaveInput,
  researchTabRequest,
} from "./research-workspace-model";

const projectDefault = {
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  kind: "country" as const,
};

describe("research workspace model", () => {
  it("rebuilds the market a recent search ran in", () => {
    expect(recentSearchLocation({ market: "United States" }, projectDefault)).toBe(projectDefault);
    expect(
      recentSearchLocation({ locationKey: "US", market: "United States" }, projectDefault),
    ).toBe(projectDefault);
    expect(recentSearchLocation({ locationKey: "DE", market: "Germany" }, projectDefault)).toEqual(
      expect.objectContaining({ canonicalKey: "DE", countryCode: "DE", kind: "country" }),
    );
    expect(
      recentSearchLocation(
        { locationKey: "US/US-TX/Austin", market: "Austin, Texas, United States" },
        projectDefault,
      ),
    ).toEqual({
      canonicalKey: "US/US-TX/Austin",
      cityName: "Austin",
      countryCode: "US",
      displayName: "Austin, Texas, United States",
      kind: "city",
    });
  });

  it("falls back from a stale recent connection and detects expired cache entries", () => {
    const replay = recentSearchReplay(
      {
        cachedUntil: "2026-07-22T10:00:00.000Z",
        connectionId: "deleted",
        createdAt: "2026-07-22T08:00:00.000Z",
        includeClickstream: true,
        locationKey: "DE",
        market: "Germany",
        mode: "ideas",
        resultLimit: 300,
        seed: "seo",
      },
      "conn_b00000000000000000000000",
      ["conn_a00000000000000000000000", "conn_b00000000000000000000000"],
      new Date("2026-07-22T10:01:00.000Z"),
    );

    expect(replay).toMatchObject({
      cached: false,
      connectionId: "conn_b00000000000000000000000",
      overrides: {
        connectionId: "conn_b00000000000000000000000",
        includeClickstream: true,
        locationKey: "DE",
        mode: "ideas",
        resultLimit: 300,
      },
    });
  });

  it("rebuilds retry input from the failed tab instead of form state", () => {
    expect(
      researchTabRequest({
        connectionId: "conn_a00000000000000000000000",
        id: "tab_1",
        includeClickstream: true,
        location: projectDefault,
        mode: "related",
        outcome: { ok: false, reason: "rate_limited" },
        requestedLimit: 100,
        seed: "foo",
      }),
    ).toEqual({
      connectionId: "conn_a00000000000000000000000",
      includeClickstream: true,
      locationKey: "US",
      mode: "related",
      resultLimit: 100,
    });
  });

  it("maps service failures to the frozen page states", () => {
    expect(researchFailureState({ ok: false, reason: "budget_exhausted" })).toBe(
      "budget_exhausted",
    );
    expect(researchFailureState({ ok: false, reason: "needs_reauth" })).toBe("needs_reauth");
    expect(researchFailureState({ ok: false, reason: "unsupported_location" })).toBe(
      "unsupported_location",
    );
    expect(researchFailureState({ ok: false, reason: "rate_limited" })).toBe("lookup_failed");
  });

  it("formats the next monthly reset in the project timezone", () => {
    expect(nextBudgetResetLabel("America/New_York", new Date("2026-07-22T12:00:00Z"))).toBe(
      "Aug 1, 2026, 12:00 AM",
    );
    expect(nextBudgetResetLabel("Europe/Warsaw", new Date("2026-07-31T23:00:00Z"))).toBe(
      "Sep 1, 2026, 12:00 AM",
    );
  });

  it("adds session spend only for non-cached source calls", () => {
    expect(
      actualResearchCostCents({
        cached: false,
        cachedUntil: "2026-07-22T22:00:00.000Z",
        connections: [],
        costCents: 8,
        fetchedAt: "2026-07-22T10:00:00.000Z",
        ok: true,
        provider: "DataForSEO",
        rows: [],
        sources: [
          { cached: true, costCents: 5, returned: 10, source: "related", status: "ok" },
          { cached: false, costCents: 3, returned: 10, source: "idea", status: "ok" },
        ],
      }),
    ).toBe(3);
  });

  it("formats paid, cached, and unknown retry labels", () => {
    expect(researchRetryLabel({ cached: false, costCents: 3, loading: false })).toBe(
      "Retry ~$0.03",
    );
    expect(researchRetryLabel({ cached: true, costCents: 0, loading: false })).toBe(
      "Retry free, cached",
    );
    expect(researchRetryLabel({ cached: false, costCents: null, loading: false })).toBe("Retry");
  });

  it("maps with bounded concurrency and preserves input order", async () => {
    const items = [0, 1, 2, 3, 4, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    const results = await mapWithConcurrency(items, 2, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 10;
    });

    expect(results).toEqual([0, 10, 20, 30, 40, 50]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("handles an empty seed list without invoking the worker", async () => {
    const worker = async () => {
      throw new Error("worker should not run for an empty list");
    };
    await expect(mapWithConcurrency([], 4, worker)).resolves.toEqual([]);
  });

  it("serializes grouped research snapshots for the save action", () => {
    const row = {
      alreadySaved: false,
      alreadyTracked: false,
      competition: 0.4,
      cpcCents: 125,
      difficulty: 30,
      intent: "commercial" as const,
      keyword: "rank tracker",
      monthlyTrend: [{ month: 7, searchVolume: 900, year: 2026 }],
      searchVolume: 1_200,
      source: "idea" as const,
    };

    expect(
      researchSaveInput("prj_1", {
        location: "US",
        rows: [{ ...row, variants: [row, { ...row, keyword: "rank-tracker" }] }],
        sourceSeed: "seo tools",
      }),
    ).toEqual({
      projectId: "prj_1",
      rows: [
        {
          cpcCents: 125,
          difficulty: 30,
          intent: "commercial",
          keyword: "rank tracker",
          location: "US",
          monthlyTrend: [{ month: 7, searchVolume: 900, year: 2026 }],
          searchVolume: 1_200,
          sourceSeed: "seo tools",
          variantCount: 1,
        },
      ],
    });
  });

  it("updates saved state without changing tracked state", () => {
    const row = {
      alreadySaved: false,
      alreadyTracked: true,
      competition: null,
      cpcCents: null,
      difficulty: null,
      intent: null,
      keyword: "Rank Tracker",
      monthlyTrend: [],
      searchVolume: null,
      source: "idea" as const,
    };
    const tabs = [
      {
        id: "tab_1",
        includeClickstream: false,
        location: projectDefault,
        mode: "auto" as const,
        outcome: {
          cached: true,
          cachedUntil: "2026-07-22T22:00:00.000Z",
          connections: [],
          costCents: 0,
          fetchedAt: "2026-07-22T10:00:00.000Z",
          ok: true as const,
          provider: "DataForSEO",
          rows: [row],
          sources: [],
        },
        requestedLimit: 100 as const,
        seed: "seo",
      },
    ];

    expect(markTabsSaved(tabs, ["  rank   tracker "], true)[0]?.outcome).toMatchObject({
      rows: [{ alreadySaved: true, alreadyTracked: true }],
    });
  });
});
