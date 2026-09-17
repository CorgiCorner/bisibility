import { describe, expect, it } from "vitest";
import { clicksToSessionsKpi, searchInsightsKpis, windowTotals } from "./kpis-model";

describe("windowTotals", () => {
  it("takes the ratio of the window, not the average of its days", () => {
    // A day with three impressions must not outvote a day with thirty thousand.
    const totals = windowTotals({
      clicks: 12_480n,
      impressions: 486_310n,
      positionWeight: 8_948_104,
    });

    expect(totals.clicks).toBe(12_480);
    expect(totals.impressions).toBe(486_310);
    expect(totals.ctr).toBeCloseTo(0.02566, 5);
    expect(totals.position).toBeCloseTo(18.4, 1);
  });

  it("reports zeros rather than dividing by an empty window", () => {
    expect(windowTotals({ clicks: 0, impressions: 0, positionWeight: 0 })).toEqual({
      clicks: 0,
      ctr: 0,
      impressions: 0,
      position: 0,
    });
    expect(windowTotals(undefined).position).toBe(0);
  });
});

describe("searchInsightsKpis", () => {
  const comparedTotals = {
    current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
    previous: { clicks: 11_534, ctr: 0.0244, impressions: 471_690, position: 20 },
  };

  it("suppresses every delta until the previous window is covered", () => {
    const cards = searchInsightsKpis(comparedTotals, false);

    expect(
      cards.map(({ delta, dir, previous, value }) => ({ delta, dir, previous, value })),
    ).toEqual([
      { delta: { kind: "new" }, dir: "flat", previous: null, value: 12_480 },
      { delta: { kind: "new" }, dir: "flat", previous: null, value: 486_310 },
      { delta: { kind: "new" }, dir: "flat", previous: null, value: 0.0257 },
      { delta: { kind: "new" }, dir: "flat", previous: null, value: 18.4 },
    ]);
  });

  it("keeps raw metrics and delta units in the model", () => {
    const baseline = searchInsightsKpis(comparedTotals);

    expect(baseline).toEqual([
      {
        delta: { kind: "changed", unit: "percent_change", value: 0.082 },
        dir: "up",
        metric: "clicks",
        previous: 11_534,
        source: "gsc",
        value: 12_480,
        valueKind: "count",
      },
      {
        delta: { kind: "changed", unit: "percent_change", value: 0.031 },
        dir: "up",
        metric: "impressions",
        previous: 471_690,
        source: "gsc",
        value: 486_310,
        valueKind: "count",
      },
      {
        delta: { kind: "changed", unit: "percentage_points", value: 0.0013 },
        dir: "up",
        metric: "ctr",
        previous: 0.0244,
        source: "gsc",
        value: 0.0257,
        valueKind: "percentage",
      },
      {
        delta: { kind: "changed", unit: "position", value: 1.6 },
        dir: "up",
        metric: "position",
        previous: 20,
        source: "gsc",
        value: 18.4,
        valueKind: "position",
      },
    ]);
    expect(JSON.stringify(searchInsightsKpis(comparedTotals, true))).toBe(JSON.stringify(baseline));
  });

  it("retains each metric and its source code for presentation", () => {
    const cards = searchInsightsKpis(comparedTotals);

    expect(cards.map((card) => card.metric)).toEqual(["clicks", "impressions", "ctr", "position"]);
    expect(cards.every((card) => card.source === "gsc")).toBe(true);
    expect(cards[0]).toMatchObject({ previous: 11_534, value: 12_480 });
    expect(cards[2]).toMatchObject({ previous: 0.0244, value: 0.0257 });
    expect(cards[3]).toMatchObject({
      delta: { kind: "changed", unit: "position", value: 1.6 },
      dir: "up",
      previous: 20,
      value: 18.4,
    });
  });

  it("says the compared period holds nothing rather than comparing against its zeros", () => {
    const cards = searchInsightsKpis({
      current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
      previous: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
    });

    expect(cards.map((card) => card.delta)).toEqual([
      { kind: "new" },
      { kind: "new" },
      { kind: "new" },
      { kind: "new" },
    ]);
    expect(cards.every((card) => card.previous === null)).toBe(true);
  });

  it("does not colour a window that lost all its traffic as an improvement", () => {
    const cards = searchInsightsKpis({
      current: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
      previous: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
    });

    expect(cards[0]).toMatchObject({
      delta: { kind: "changed", unit: "percent_change", value: -1 },
      dir: "down",
    });
    expect(cards[2]).toMatchObject({ delta: { kind: "no_data" }, dir: "flat", previous: 0.0257 });
    expect(cards[3]).toMatchObject({ delta: { kind: "no_data" }, dir: "flat", previous: 18.4 });
  });
});

describe("clicksToSessionsKpi", () => {
  const clicks = {
    current: { clicks: 100, ctr: 0, impressions: 100, position: 0 },
    previous: { clicks: 100, ctr: 0, impressions: 100, position: 0 },
  };

  it("keeps the sessions-to-clicks ratio numeric for locale presentation", () => {
    expect(clicksToSessionsKpi(clicks, { current: 92, previous: 88 })).toEqual({
      kind: "visible",
      kpi: {
        delta: { kind: "changed", unit: "percentage_points", value: 0.04 },
        dir: "up",
        metric: "clicks_to_sessions",
        previous: 0.88,
        source: "gsc",
        value: 0.92,
        valueKind: "percentage",
      },
    });
  });

  it("uses the uncovered-baseline affordance when comparison coverage is unavailable", () => {
    expect(clicksToSessionsKpi(clicks, { current: 92, previous: 88 }, false)).toEqual({
      kind: "visible",
      kpi: expect.objectContaining({ delta: { kind: "new" }, dir: "flat", previous: null }),
    });
  });

  it("hides instead of fabricating a ratio when there are no clicks", () => {
    expect(
      clicksToSessionsKpi(
        { ...clicks, current: { ...clicks.current, clicks: 0 } },
        {
          current: 92,
          previous: 88,
        },
      ),
    ).toEqual({ kind: "hidden", reason: "zero_clicks", source: "gsc" });
  });

  it("keeps zero sessions as a measured zero when clicks exist", () => {
    expect(clicksToSessionsKpi(clicks, { current: 0, previous: 88 })).toEqual({
      kind: "visible",
      kpi: expect.objectContaining({ value: 0, valueKind: "percentage" }),
    });
  });
});
