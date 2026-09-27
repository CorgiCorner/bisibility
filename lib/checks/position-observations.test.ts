import { describe, expect, it } from "vitest";
import { observationSeries, positionObservations } from "./position-observations";

const check = (
  day: number,
  position: number | null,
  depth: number | null = 20,
  version: string | null = "v2",
) => ({
  checkedAt: new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`),
  normalizationVersion: version,
  requestedDepth: depth,
  position,
  status: "completed",
});

describe("recorded position history", () => {
  it("preserves earlier segments and breaks lines at unknown or changed contracts", () => {
    const points = positionObservations([
      check(6, 3, 50),
      check(5, null, 50),
      check(4, 4, 50),
      check(3, 5),
      check(2, 6),
      check(1, 7, null, null),
    ]);
    expect(points.map((point) => point.position)).toEqual([7, 6, 5, 4, null, 3]);
    expect(observationSeries(points)).toEqual([
      [7, null, null, null, null, null],
      [null, 6, 5, null, null, null],
      [null, null, null, 4, null, 3],
    ]);
  });
  it("keeps failed, running and deferred attempts out of rank history", () => {
    expect(
      positionObservations(
        ["failed", "running", "deferred"].map((status) => ({ ...check(1, 1), status })),
      ),
    ).toEqual([]);
  });
});
