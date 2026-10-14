import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { observationSeries, positionObservations } from "./position-observations";

const check = (
  day: number,
  position: number | null,
  depth: number | null = 20,
  version: string | null = "v2",
) => {
  const at = new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);
  const scope = { ...fixtureScope, targetId: "target", policyRevision: `depth-${depth}` };
  return recordedFixture(position, {
    normalizationVersion: version,
    requestedDepth: depth,
    completeThrough: depth,
    configuredScope: scope,
    effectiveScope: scope,
    observedAt: at,
    recordedAt: at,
  });
};

beforeEach(() => vi.setSystemTime(new Date("2026-10-12T12:00:00Z")));

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
