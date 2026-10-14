import { VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";
import { describe, expect, it } from "vitest";
import { aggregateMeasurements } from "./aggregate";
import { fixtureAsOf, fixturePolicy, fixtureScope, measurement } from "./fixtures";
import { qualifyMeasurement } from "./qualify";

function evidence(id: string, position: number | null, unknown = false) {
  const scope = { ...fixtureScope, targetId: id };
  return qualifyMeasurement(
    measurement(position, {
      targetId: id,
      configuredScope: scope,
      effectiveScope: scope,
      ...(unknown ? { completeThrough: null } : {}),
    }),
    fixturePolicy,
  );
}
const policy = {
  metricId: "visibility",
  definitionVersion: "v1",
  asOf: fixtureAsOf,
  curve: VISIBILITY_POSITION_WEIGHTS_V1,
};

describe("finite metric denominators", () => {
  it("does not let an excluded extreme weight erase the measured denominator", () => {
    const result = aggregateMeasurements(
      [
        { id: "a", current: evidence("a", 1), baseline: null, volume: 1e-200 },
        { id: "b", current: evidence("b", null, true), baseline: null, volume: 1e200 },
      ],
      policy,
    );
    expect(result.value).toBe(100);
    expect(result.dataCoverage).toBe(0.5);
    expect(result.counts.comparable).toBe(0);
  });
  it("normalizes paired changes independently from the broader headline cohort", () => {
    const result = aggregateMeasurements(
      [
        { id: "a", current: evidence("a", 1), baseline: evidence("a", 2), volume: 1e-200 },
        { id: "b", current: evidence("b", 20), baseline: null, volume: 1e200 },
      ],
      policy,
    );
    expect(result.delta).toBeCloseTo(43.33333333333333, 9);
    expect(result.counts.comparable).toBe(1);
    expect(result.contributions.find((row) => row.targetId === "b")?.delta).toBeNull();
    expect(result.contributions.reduce((sum, row) => sum + (row.delta ?? 0), 0)).toBeCloseTo(
      result.delta!,
      9,
    );
  });
  it("keeps the ratio invariant when the finite curve has a very large scale", () => {
    const input = [
      { id: "a", current: evidence("a", 1), baseline: null, volume: 1 },
      { id: "b", current: evidence("b", 2), baseline: null, volume: 1 },
    ];
    const result = aggregateMeasurements(input, { ...policy, curve: [1e308, 5e307] });
    expect(result.value).toBe(75);
    expect(result.contributions.map(({ value }) => value)).toEqual([50, 25]);
    expect(result.value).toBe(aggregateMeasurements(input, { ...policy, curve: [1, 0.5] }).value);
  });
});
