import { VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";
import { describe, expect, it } from "vitest";
import { aggregateMeasurements } from "./aggregate";
import { fixtureAsOf, fixturePolicy, fixtureScope, measurement } from "./fixtures";
import { comparablePair, qualifyMeasurement } from "./qualify";
import { recordedMeasurement } from "./recorded-check";
import { resolveMeasurements } from "./resolve";

function qualified(position: number | null, options: Parameters<typeof measurement>[1] = {}) {
  return qualifyMeasurement(measurement(position, options), fixturePolicy);
}
function target(id: string, value: ReturnType<typeof qualified>) {
  return qualifyMeasurement(
    {
      ...value.measurement,
      targetId: id,
      configuredScope: { ...fixtureScope, targetId: id },
      effectiveScope: { ...fixtureScope, targetId: id },
    },
    {
      ...fixturePolicy,
      ...(value.freshnessReason === "policy_unavailable" ? { freshForMs: null } : {}),
    },
  );
}
function report(currentB: ReturnType<typeof qualified>) {
  return aggregateMeasurements(
    [
      {
        id: "a",
        current: target("a", qualified(1)),
        baseline: target("a", qualified(1)),
        volume: 1,
      },
      { id: "b", current: target("b", currentB), baseline: target("b", qualified(2)), volume: 1 },
    ],
    {
      metricId: "visibility",
      definitionVersion: "v1",
      asOf: fixtureAsOf,
      curve: VISIBILITY_POSITION_WEIGHTS_V1,
    },
  );
}
describe("measurement evidence oracle", () => {
  it("does not infer absence from completed status or requested depth", () => {
    expect(qualified(null, { completeThrough: null }).evidence).toBe("unknown");
    expect(qualified(null, { completeness: "unknown", completeThrough: null }).reason).toBe(
      "unproven_absence",
    );
    expect(qualified(null, { completeThrough: 20 }).evidence).toBe("known_absent");
  });
  it("keeps a proved positive from a partial result", () => {
    expect(qualified(6, { completeness: "truncated", completeThrough: null }).evidence).toBe(
      "positive",
    );
  });
  it("preserves Visibility requested-depth policy separately from proof", () => {
    expect(qualified(1, { requestedDepth: 10, completeThrough: 100 }).reason).toBe(
      "insufficient_depth",
    );
    expect(
      comparablePair(qualified(3, { requestedDepth: 20, completeThrough: 20 }), qualified(8)),
    ).toBe(true);
  });
  it("does not qualify captured country fallback as city", () => {
    const country = { ...fixtureScope, location: "Country A" };
    expect(
      qualifyMeasurement(measurement(1, { effectiveScope: country }), {
        ...fixturePolicy,
        expectedScope: fixtureScope,
      }).reason,
    ).toBe("scope_mismatch");
  });
  it("leaves legacy scope and observation time unknown", () => {
    const check = recordedMeasurement(
      {
        position: 1,
        status: "completed",
        requestedDepth: 100,
        normalizationVersion: "v1",
        checkedAt: fixtureAsOf,
        observationRun: { completeness: "complete" },
      },
      "a",
    );
    expect(check.configuredScope).toBeNull();
    expect(check.observedAt).toBeNull();
    expect(qualifyMeasurement(check, fixturePolicy)).toMatchObject({
      evidence: "unknown",
      position: 1,
      comparisonKey: null,
    });
  });
  it("rejects missing revision and timestamp for comparison", () => {
    expect(
      qualified(1, {
        configuredScope: { ...fixtureScope, targetRevision: null },
        effectiveScope: { ...fixtureScope, targetRevision: null },
      }).comparisonKey,
    ).toBeNull();
    expect(qualified(1, { observedAt: null }).comparisonKey).toBeNull();
  });
  it("uses exact shared 78.333333,50,100-with-half-coverage fixture", () => {
    expect(report(qualified(2)).value).toBeCloseTo(78.33333333333333, 9);
    expect(report(qualified(null)).value).toBe(50);
    const unknown = report(qualified(null, { completeThrough: null }));
    expect(unknown.value).toBe(100);
    expect(unknown.observedCoverage).toBe(0.5);
    expect(unknown.delta).toBe(0);
    expect(unknown.counts).toMatchObject({ expected: 2, measured: 1, comparable: 1 });
  });
  it("returns null for all-zero weights and a zero expected denominator", () => {
    const policy = {
      metricId: "visibility",
      definitionVersion: "v1",
      asOf: fixtureAsOf,
      curve: VISIBILITY_POSITION_WEIGHTS_V1,
    };
    expect(
      aggregateMeasurements(
        [
          {
            id: "a",
            current: target("a", qualified(1)),
            baseline: target("a", qualified(2)),
            volume: 0,
          },
        ],
        policy,
      ).value,
    ).toBeNull();
    expect(aggregateMeasurements([], policy)).toMatchObject({
      value: null,
      delta: null,
      observedCoverage: null,
      dataCoverage: null,
    });
  });
  it("does not invent a freshness policy or numeric fresh count", () => {
    const current = qualifyMeasurement(measurement(1), { ...fixturePolicy, freshForMs: null });
    const result = aggregateMeasurements(
      [{ id: "a", current: target("a", current), baseline: null, volume: 1 }],
      {
        metricId: "visibility",
        definitionVersion: "v1",
        asOf: fixtureAsOf,
        curve: VISIBILITY_POSITION_WEIGHTS_V1,
      },
    );
    expect(result).toMatchObject({
      value: 100,
      observedCoverage: 1,
      dataCoverage: null,
      freshness: "unknown",
      freshnessReason: "policy_unavailable",
      counts: { freshDeterminate: null },
    });
  });
  it("computes configured fresh coverage against expected count", () => {
    const result = report(qualified(2));
    expect(result.dataCoverage).toBe(result.counts.freshDeterminate! / result.counts.expected);
    expect(result.dataCoverage).toBe(1);
  });
  it("keeps fixed cohort delta0 when half the latest attempts fail", () => {
    const targets = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      current: index < 50 ? target(String(index), qualified(5)) : null,
      baseline: target(String(index), qualified(5)),
      latestAttempt: measurement(index < 50 ? 5 : null, {
        targetId: String(index),
        execution: index < 50 ? "completed" : "failed",
      }),
      volume: 1,
    }));
    const result = aggregateMeasurements(targets, {
      metricId: "visibility",
      definitionVersion: "v1",
      asOf: fixtureAsOf,
      curve: VISIBILITY_POSITION_WEIGHTS_V1,
    });
    expect(result.delta).toBe(0);
    expect(result.counts).toMatchObject({
      expected: 100,
      measured: 50,
      comparable: 50,
      failed: 50,
    });
    expect(result.observedCoverage).toBe(0.5);
  });
  it("contributions sum to score and paired changes to delta before formatting", () => {
    const result = report(qualified(3));
    expect(result.contributions.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBeCloseTo(
      result.value!,
      9,
    );
    expect(result.contributions.reduce((sum, row) => sum + (row.delta ?? 0), 0)).toBeCloseTo(
      result.delta!,
      9,
    );
    expect(report(qualified(3))).toEqual(result);
  });
});

describe("measurement history boundaries", () => {
  const before = new Date("2026-10-11T10:00:00.000Z");
  const older = new Date("2026-10-10T10:00:00.000Z");
  it("does not skip known absence to invent #5->#4 movement", () => {
    const result = resolveMeasurements(
      [
        measurement(4),
        measurement(null, { id: "absent", recordedAt: before, observedAt: before }),
        measurement(5, { id: "older", recordedAt: older, observedAt: older }),
      ],
      fixturePolicy,
    );
    expect(result).toMatchObject({ event: "re_entered", movement: null });
  });
  it("does not join A->B->A just because an old key returns", () => {
    const result = resolveMeasurements(
      [
        measurement(4),
        measurement(3, {
          id: "boundary",
          recordedAt: before,
          observedAt: before,
          configuredScope: { ...fixtureScope, location: "City B" },
          effectiveScope: { ...fixtureScope, location: "City B" },
        }),
        measurement(5, { id: "older", recordedAt: older, observedAt: older }),
      ],
      fixturePolicy,
    );
    expect(result.baseline).toBeNull();
    expect(result.boundary?.measurement.id).toBe("boundary");
    expect(result.movement).toBeNull();
  });
  it("suppresses a missing requested window baseline", () => {
    expect(resolveMeasurements([measurement(4)], fixturePolicy)).toMatchObject({
      event: "first",
      baseline: null,
      movement: null,
    });
  });
  it("retains last success while latest failure does not become improvement", () => {
    const result = resolveMeasurements(
      [
        measurement(null, { execution: "failed" }),
        measurement(4, { id: "last-success", recordedAt: before, observedAt: before }),
        measurement(5, { id: "older", recordedAt: older, observedAt: older }),
      ],
      fixturePolicy,
    );
    expect(result.lastSuccess?.position).toBe(4);
    expect(result.event).toBe("unknown");
    expect(result.movement).toBeNull();
  });
});
