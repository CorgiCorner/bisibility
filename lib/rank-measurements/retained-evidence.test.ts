import { VISIBILITY_POSITION_WEIGHTS_V1 } from "@/lib/visibility/definition";
import { describe, expect, it } from "vitest";
import { aggregateMeasurements } from "./aggregate";
import { fixtureAsOf, fixturePolicy, fixtureScope, measurement } from "./fixtures";
import { qualifyMeasurement } from "./qualify";
import { recordedMeasurement } from "./recorded-check";
import { resolveMeasurements } from "./resolve";

const aggregatePolicy = {
  metricId: "visibility",
  definitionVersion: "v1",
  asOf: fixtureAsOf,
  curve: VISIBILITY_POSITION_WEIGHTS_V1,
};

describe("retained evidence and its real observation time", () => {
  it("keeps a still-fresh measured success while separately reporting a failed attempt", () => {
    const good = qualifyMeasurement(measurement(1), fixturePolicy);
    const result = aggregateMeasurements(
      [
        {
          id: fixtureScope.targetId,
          current: good,
          baseline: good,
          volume: 1,
          latestAttempt: measurement(null, { id: "failed", execution: "failed" }),
        },
      ],
      aggregatePolicy,
    );
    expect(result).toMatchObject({
      value: 100,
      delta: 0,
      dataCoverage: 1,
      counts: { expected: 1, measured: 1, metricEligible: 1, failed: 1, comparable: 1 },
    });
    const stale = qualifyMeasurement(
      measurement(1, {
        observedAt: new Date("2026-10-01T10:00:00Z"),
      }),
      fixturePolicy,
    );
    expect(
      aggregateMeasurements(
        [
          {
            id: fixtureScope.targetId,
            current: stale,
            baseline: null,
            volume: 1,
            latestAttempt: measurement(null, { execution: "failed" }),
          },
        ],
        aggregatePolicy,
      ),
    ).toMatchObject({
      value: null,
      dataCoverage: 0,
      counts: { measured: 1, metricEligible: 0, failed: 1, stale: 1 },
    });
  });

  it("evaluates a weekly baseline's freshness in that baseline period", () => {
    const previousAt = new Date("2026-10-05T10:00:00Z");
    const result = resolveMeasurements(
      [
        measurement(5),
        measurement(8, {
          id: "baseline",
          observedAt: previousAt,
          recordedAt: new Date("2026-10-05T10:01:00Z"),
        }),
      ],
      {
        ...fixturePolicy,
        freshForMs: 24 * 60 * 60 * 1000,
        baselineBefore: new Date("2026-10-05T12:00:00Z"),
        baselineNotBefore: new Date("2026-10-04T12:00:00Z"),
      },
    );
    expect(result.baseline?.freshness).toBe("fresh");
    expect(result).toMatchObject({ event: "moved", movement: 3 });
  });

  it("does not replace a newer SERP with an older observation collected late", () => {
    const result = resolveMeasurements(
      [
        measurement(4),
        measurement(9, {
          id: "late-collection",
          observedAt: new Date("2026-10-12T08:00:00Z"),
          recordedAt: new Date("2026-10-12T11:00:00Z"),
        }),
      ],
      fixturePolicy,
    );
    expect(result.current?.position).toBe(4);
    expect(result.baseline?.position).toBe(9);
  });

  it("does not substitute a requested city for missing actual scope", () => {
    const check = measurement(1, { effectiveScope: null });
    expect(qualifyMeasurement(check, fixturePolicy)).toMatchObject({
      evidence: "unknown",
      reason: "missing_scope",
      position: 1,
    });
    const recorded = recordedMeasurement(
      {
        position: 1,
        status: "completed",
        requestedDepth: 100,
        normalizationVersion: "v1",
        checkedAt: fixtureAsOf,
        observationRun: {
          completeness: "complete",
          projectId: "project-b",
          surface: "web_serp",
          engine: "google",
          configuredScope: fixtureScope,
          effectiveScope: fixtureScope,
        },
      },
      fixtureScope.targetId,
      fixtureScope.projectId,
    );
    expect(recorded.configuredScope).toBeNull();
    expect(recorded.effectiveScope).toBeNull();
  });
  it("keeps captured history distinct from current definition proof", () => {
    const check = measurement(1);
    expect(qualifyMeasurement(check, fixturePolicy).evidence).toBe("positive");
    expect(
      qualifyMeasurement(check, { ...fixturePolicy, requireCurrentScope: true }),
    ).toMatchObject({
      evidence: "unknown",
      reason: "current_scope_unavailable",
      comparisonKey: null,
      position: 1,
    });
    expect(
      qualifyMeasurement(check, {
        ...fixturePolicy,
        requireCurrentScope: true,
        expectedScope: fixtureScope,
      }).evidence,
    ).toBe("positive");
    expect(
      qualifyMeasurement(check, {
        ...fixturePolicy,
        requireCurrentScope: true,
        expectedScope: { ...fixtureScope, targetRevision: "new-definition" },
      }),
    ).toMatchObject({ evidence: "unknown", reason: "scope_mismatch" });
  });
});

describe("weight validation and finite aggregate arithmetic", () => {
  it("rejects invalid known weights rather than silently imputing them", () => {
    const current = qualifyMeasurement(measurement(1), fixturePolicy);
    for (const volume of [-1, NaN, Infinity]) {
      expect(() =>
        aggregateMeasurements(
          [
            {
              id: fixtureScope.targetId,
              current,
              baseline: null,
              volume,
            },
          ],
          aggregatePolicy,
        ),
      ).toThrow("finite and nonnegative");
    }
  });

  it("preserves weighted visibility when finite weights would overflow their sum", () => {
    const targets = [1, 2].map((rank) => {
      const id = `target-${rank}`;
      const current = qualifyMeasurement(
        measurement(rank, {
          targetId: id,
          configuredScope: { ...fixtureScope, targetId: id },
          effectiveScope: { ...fixtureScope, targetId: id },
        }),
        fixturePolicy,
      );
      return { id, current, baseline: current, volume: Number.MAX_VALUE };
    });
    const result = aggregateMeasurements(targets, aggregatePolicy);
    expect(result.value).toBeCloseTo(78.33333333333333, 9);
    expect(result.delta).toBe(0);
    expect(result.contributions.every(({ value }) => Number.isFinite(value))).toBe(true);
  });
});
