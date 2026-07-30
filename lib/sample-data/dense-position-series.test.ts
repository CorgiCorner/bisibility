import { describe, expect, it } from "vitest";
import { DENSE_CHECK_COUNT, densePositionSeries } from "./dense-position-series";

const anchors = [6, 5, 4, 3] as const;

describe("densePositionSeries", () => {
  it("emits DENSE_CHECK_COUNT integer positions of at least 1", () => {
    const series = densePositionSeries(anchors, "kw_17wdrqp");

    expect(series).toHaveLength(DENSE_CHECK_COUNT);
    for (const position of series) {
      expect(Number.isInteger(position)).toBe(true);
      expect(position).toBeGreaterThanOrEqual(1);
    }
  });

  it("pins the first and final anchor so KPI cards stay coherent", () => {
    const series = densePositionSeries(anchors, "kw_17wdrqp");

    expect(series[0]).toBe(anchors[0]);
    expect(series.at(-1)).toBe(anchors.at(-1));
  });

  it("is deterministic for the same keyword and varies the interior across keywords", () => {
    const first = densePositionSeries(anchors, "kw_17wdrqp");
    const repeat = densePositionSeries(anchors, "kw_17wdrqp");
    const other = densePositionSeries(anchors, "kw_0xjaz0k");

    expect(first).toEqual(repeat);
    expect(first).not.toEqual(other);
  });

  it("keeps a single anchor flat and returns empty without anchors", () => {
    expect(densePositionSeries([4], "kw_x")).toEqual(Array(DENSE_CHECK_COUNT).fill(4));
    expect(densePositionSeries([], "kw_x")).toEqual([]);
  });
});
