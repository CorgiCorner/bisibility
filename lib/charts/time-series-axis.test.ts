import { describe, expect, it } from "vitest";
import {
  resolveTimeSeriesAxis,
  timeSeriesAxisNumber,
  timeSeriesCategoryTicks,
  timeSeriesYAxisWidth,
} from "./time-series-axis";

describe("time series axis", () => {
  it("thins category ticks and always keeps the first and last day", () => {
    expect(timeSeriesCategoryTicks(0)).toEqual([]);
    expect(timeSeriesCategoryTicks(1)).toEqual([0]);
    expect(timeSeriesCategoryTicks(2)).toEqual([0, 1]);
    const ticks = timeSeriesCategoryTicks(30);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(29);
    expect(ticks.length).toBeLessThan(10);
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
  });

  it("uses one compact notation for a large axis and sizes the gutter to the widest tick", () => {
    const full = timeSeriesAxisNumber(10000, "en", false);
    const compact = timeSeriesAxisNumber(10000, "en", true);
    expect(full).toBe("10,000");
    expect(compact).toMatch(/10K/);
    expect(timeSeriesYAxisWidth([full], 42)).toBeGreaterThan(timeSeriesYAxisWidth([compact], 42));
    const axis = resolveTimeSeriesAxis({
      labelCount: 30,
      locale: "en",
      min: 0,
      series: [{ values: [0, 10000] }],
      yWidth: 42,
    });
    expect(axis.formatTick(10000)).toBe(compact);
    expect(axis.formatTick(0)).toBe(timeSeriesAxisNumber(0, "en", true));
    expect(axis.yAxisWidth).toBeGreaterThanOrEqual(42);
    expect(axis.categoryTicks[0]).toBe(0);
    expect(axis.categoryTicks.at(-1)).toBe(29);
  });

  it("keeps a caller format and an explicit tick list", () => {
    const axis = resolveTimeSeriesAxis({
      formatValue: (value) => `${value}%`,
      labelCount: 4,
      locale: "en",
      max: 100,
      min: 0,
      series: [{ values: [10000] }],
      xTickIndexes: [0, 3],
      yWidth: 56,
    });
    expect(axis.formatTick(100)).toBe("100%");
    expect(axis.categoryTicks).toEqual([0, 3]);
    expect(axis.yAxisWidth).toBeGreaterThanOrEqual(56);
  });
});
