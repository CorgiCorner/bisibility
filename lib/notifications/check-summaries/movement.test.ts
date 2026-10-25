import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check, date, thresholds } from "./fixtures.test-support";
import { movement } from "./movement";

beforeEach(() => vi.setSystemTime(date("07:05:00")));
afterEach(() => vi.useRealTimers());

describe("CN-6/CN-7 recipient movement thresholds", () => {
  it("uses inclusive position movement and crossing in either direction", () => {
    expect(movement(check({ position: 25 }), check({ position: 20 }), thresholds)).toEqual({
      direction: "down",
      significant: true,
    });
    expect(movement(check({ position: 24 }), check({ position: 20 }), thresholds).significant).toBe(
      false,
    );
    expect(movement(check({ position: 11 }), check({ position: 10 }), thresholds).significant).toBe(
      true,
    );
    expect(movement(check({ position: 10 }), check({ position: 11 }), thresholds)).toEqual({
      direction: "up",
      significant: true,
    });
    expect(
      movement(check({ position: null }), check({ position: 10 }), thresholds).significant,
    ).toBe(true);
    expect(
      movement(check({ position: 10 }), check({ position: null }), thresholds).significant,
    ).toBe(true);
  });
  it("incomplete evidence is not an outside-boundary observation", () => {
    const partial = recordedFixture(null, { requestedDepth: 100, completeThrough: 50 });
    const before = recordedFixture(10, { requestedDepth: 100, completeThrough: 100 });
    expect(movement(check(partial), check(before), thresholds).significant).toBe(false);
    for (const completeness of ["partial", "unresolved"])
      expect(
        movement(
          check({ position: null, raw: { recovery: { completeness } } }),
          check({ position: 10 }),
          thresholds,
        ).significant,
      ).toBe(false);
  });
  it("complete configured Top 20 absence remains comparable and can cross top 10", () => {
    const current = recordedFixture(null, { requestedDepth: 20, completeThrough: 20 });
    const before = recordedFixture(10, { requestedDepth: 20, completeThrough: 20 });
    expect(movement(check(current), check(before), thresholds).significant).toBe(true);
    expect(
      movement(check(current), check(before), { topN: 30, positionMove: 100 }).significant,
    ).toBe(false);
    expect(
      movement(
        check({ position: null, requestedDepth: 20 }),
        check({ position: 10, requestedDepth: 20 }),
        thresholds,
      ).significant,
    ).toBe(true);
  });
  it("uses only proven ordering and minimum movement for off-chart results", () => {
    const absent = check(recordedFixture(null, { requestedDepth: 20, completeThrough: 20 }));
    const outside = check(recordedFixture(95, { requestedDepth: 100, completeThrough: 100 }));
    expect(movement(absent, outside, thresholds)).toEqual({
      direction: "unchanged",
      significant: false,
    });
    expect(movement(outside, absent, thresholds)).toEqual({
      direction: "unchanged",
      significant: false,
    });
    const before = check(recordedFixture(10, { requestedDepth: 20, completeThrough: 20 }));
    expect(movement(absent, before, { topN: 1, positionMove: 11 }).significant).toBe(true);
    expect(movement(absent, before, { topN: 1, positionMove: 12 }).significant).toBe(false);
    expect(movement(before, absent, { topN: 1, positionMove: 11 }).significant).toBe(true);
  });
  it("evaluates custom values independently for each recipient", () => {
    const current = check({ position: 25 }),
      previous = check({ position: 20 });
    expect(movement(current, previous, thresholds).significant).toBe(true);
    expect(movement(current, previous, { topN: 10, positionMove: 6 }).significant).toBe(false);
    expect(movement(current, previous, { topN: 20, positionMove: 6 }).significant).toBe(true);
  });
  it("fails closed on first, disabled, failed, partial and incompatible observations", () => {
    const before = check({ position: 10 });
    expect(movement(check({ position: 20 }), null, thresholds).significant).toBe(false);
    for (const current of [
      check({ comparisonAllowed: false }),
      check({ status: "failed" }),
      check({ requestedDepth: 50 }),
      check({ normalizationVersion: null }),
      check({ position: null, raw: { recovery: { comparisonAllowed: false } } }),
    ])
      expect(
        movement(
          { ...current, position: current.position === null ? null : 30 },
          before,
          thresholds,
        ).significant,
      ).toBe(false);
  });
});
