import { describe, expect, it } from "vitest";
import {
  countDelta,
  ctrDelta,
  EMPTY_TOTALS,
  positionDelta,
  searchInsightsKpis,
  type WindowTotals,
  windowTotals,
} from "./kpis-model";

// A window is only comparable when it holds impressions, so every fixture carries them.
function totals(part: Partial<WindowTotals>): WindowTotals {
  return { clicks: 1_000, ctr: 0.02, impressions: 100_000, position: 12, ...part };
}

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

describe("countDelta", () => {
  it("signs the percentage and calls a gain an improvement", () => {
    expect(countDelta(12_480, 11_534)).toEqual({ delta: "+8.2%", dir: "up" });
  });

  it("marks a loss as a decline without colouring it as an error", () => {
    expect(countDelta(11_534, 12_480)).toEqual({ delta: "-7.6%", dir: "down" });
  });

  it("does not dress a rounding difference up as movement", () => {
    expect(countDelta(1_000, 1_000.2)).toEqual({ delta: "unchanged", dir: "flat" });
    expect(countDelta(1_000, 1_000.2)).toEqual(
      ctrDelta(totals({ ctr: 0.022 }), totals({ ctr: 0.022001 })),
    );
  });

  it("says so instead of inventing an infinite gain over an empty baseline", () => {
    expect(countDelta(120, 0)).toEqual({ delta: "new", dir: "up" });
  });

  it("speaks of an empty window in the same word the other cards use", () => {
    expect(countDelta(0, 0)).toEqual({ delta: "unchanged", dir: "flat" });
    expect(countDelta(0, 0)).toEqual(ctrDelta(EMPTY_TOTALS, EMPTY_TOTALS));
    expect(countDelta(0, 0)).toEqual(positionDelta(EMPTY_TOTALS, EMPTY_TOTALS));
  });
});

describe("ctrDelta", () => {
  it("moves in percentage points, never in percent of a percent", () => {
    expect(ctrDelta(totals({ ctr: 0.0257 }), totals({ ctr: 0.0244 }))).toEqual({
      delta: "+0.13 pp",
      dir: "up",
    });
    expect(ctrDelta(totals({ ctr: 0.0244 }), totals({ ctr: 0.0257 }))).toEqual({
      delta: "-0.13 pp",
      dir: "down",
    });
  });

  it("says unchanged rather than printing a signed zero", () => {
    expect(ctrDelta(totals({ ctr: 0.022001 }), totals({ ctr: 0.022 }))).toEqual({
      delta: "unchanged",
      dir: "flat",
    });
  });

  it("measures between the two rates the card prints, not between their raw values", () => {
    // Both render as 2.20%, so a card claiming movement would contradict its own figures.
    expect(ctrDelta(totals({ ctr: 0.02204 }), totals({ ctr: 0.021996 }))).toEqual({
      delta: "unchanged",
      dir: "flat",
    });
    // 2.20% against 2.21%: the printed numbers differ, so the line has to say so.
    expect(ctrDelta(totals({ ctr: 0.022004 }), totals({ ctr: 0.022096 }))).toEqual({
      delta: "-0.01 pp",
      dir: "down",
    });
  });

  it("reports no baseline rather than reading the whole rate as a gain", () => {
    expect(ctrDelta(totals({ ctr: 0.0257 }), EMPTY_TOTALS)).toEqual({ delta: "new", dir: "up" });
  });

  it("has nothing to compare once the current window holds no rows", () => {
    expect(ctrDelta(EMPTY_TOTALS, totals({ ctr: 0.0257 }))).toEqual({
      delta: "no data",
      dir: "flat",
    });
  });
});

describe("positionDelta", () => {
  it("names the direction, because a smaller number is the better one", () => {
    expect(positionDelta(totals({ position: 18.4 }), totals({ position: 20 }))).toEqual({
      delta: "1.6 better",
      dir: "up",
    });
    expect(positionDelta(totals({ position: 20 }), totals({ position: 18.4 }))).toEqual({
      delta: "1.6 worse",
      dir: "down",
    });
  });

  it("does not dress a rounding difference up as movement", () => {
    expect(positionDelta(totals({ position: 18.42 }), totals({ position: 18.44 }))).toEqual({
      delta: "unchanged",
      dir: "flat",
    });
  });

  it("measures between the two positions the card prints, not between their raw values", () => {
    // Both render as 17.3, so the word beside them has to be unchanged.
    expect(positionDelta(totals({ position: 17.32 }), totals({ position: 17.34 }))).toEqual({
      delta: "unchanged",
      dir: "flat",
    });
    // 17.3 against 17.4: a card cannot call that unchanged while it prints two numbers.
    expect(positionDelta(totals({ position: 17.31 }), totals({ position: 17.36 }))).toEqual({
      delta: "0.1 better",
      dir: "up",
    });
  });

  it("does not read an empty window as the distance from the top of the results", () => {
    // Zero is what an empty window's weighted average comes back as, and it is not a position.
    expect(positionDelta(totals({ position: 18.4 }), EMPTY_TOTALS)).toEqual({
      delta: "new",
      dir: "up",
    });
    expect(positionDelta(EMPTY_TOTALS, totals({ position: 18.4 }))).toEqual({
      delta: "no data",
      dir: "flat",
    });
  });
});

describe("searchInsightsKpis", () => {
  const comparedTotals = {
    current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
    previous: { clicks: 11_534, ctr: 0.0244, impressions: 471_690, position: 20 },
  };

  it("suppresses every delta until the previous window is covered", () => {
    const cards = searchInsightsKpis(comparedTotals, false);

    expect(cards.map(({ delta, dir, prev, value }) => ({ delta, dir, prev, value }))).toEqual([
      { delta: "new", dir: "flat", prev: "no data", value: "12,480" },
      { delta: "new", dir: "flat", prev: "no data", value: "486,310" },
      { delta: "new", dir: "flat", prev: "no data", value: "2.57%" },
      { delta: "new", dir: "flat", prev: "no data", value: "18.4" },
    ]);
  });

  it("keeps covered output byte-identical to the existing default", () => {
    const baseline = searchInsightsKpis(comparedTotals);

    expect(baseline).toMatchInlineSnapshot(`
      [
        {
          "delta": "+8.2%",
          "dir": "up",
          "label": "Clicks",
          "prev": "11,534",
          "source": "GSC",
          "value": "12,480",
        },
        {
          "delta": "+3.1%",
          "dir": "up",
          "label": "Impressions",
          "prev": "471,690",
          "source": "GSC",
          "value": "486,310",
        },
        {
          "delta": "+0.13 pp",
          "dir": "up",
          "label": "CTR",
          "prev": "2.44%",
          "source": "GSC",
          "value": "2.57%",
        },
        {
          "delta": "1.6 better",
          "dir": "up",
          "label": "Avg position",
          "prev": "20.0",
          "source": "GSC",
          "value": "18.4",
        },
      ]
    `);
    expect(JSON.stringify(searchInsightsKpis(comparedTotals, true))).toBe(JSON.stringify(baseline));
  });

  it("labels every card with the system that produced the number", () => {
    const cards = searchInsightsKpis(comparedTotals);

    expect(cards.map((card) => card.label)).toEqual([
      "Clicks",
      "Impressions",
      "CTR",
      "Avg position",
    ]);
    expect(cards.every((card) => card.source === "GSC")).toBe(true);
    expect(cards[0]).toMatchObject({ delta: "+8.2%", prev: "11,534", value: "12,480" });
    expect(cards[2]).toMatchObject({ prev: "2.44%", value: "2.57%" });
    expect(cards[3]).toMatchObject({ delta: "1.6 better", dir: "up", prev: "20.0", value: "18.4" });
  });

  it("says the compared period holds nothing rather than comparing against its zeros", () => {
    const cards = searchInsightsKpis({
      current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
      previous: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
    });

    expect(cards.map((card) => card.delta)).toEqual(["new", "new", "new", "new"]);
    expect(cards.every((card) => card.prev === "no data")).toBe(true);
  });

  it("does not colour a window that lost all its traffic as an improvement", () => {
    const cards = searchInsightsKpis({
      current: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
      previous: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
    });

    expect(cards[0]).toMatchObject({ delta: "-100.0%", dir: "down" });
    expect(cards[2]).toMatchObject({ delta: "no data", dir: "flat", prev: "2.57%" });
    expect(cards[3]).toMatchObject({ delta: "no data", dir: "flat", prev: "18.4" });
  });
});
