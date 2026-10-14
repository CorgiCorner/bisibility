import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { fixturePolicy, fixtureScope, measurement } from "@/lib/rank-measurements/fixtures";
import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";

/** Presentation-only legacy fixtures have no qualified current measurement evidence. */
export function unmeasuredOverviewReport(expected: number) {
  return aggregateMeasurements(
    Array.from({ length: expected }, (_, index) => ({
      id: `synthetic-unmeasured-${index}`,
      current: null,
      baseline: null,
      volume: null,
    })),
    {
      asOf: new Date("2026-06-28T12:00:00Z"),
      curve: Array.from({ length: 10 }, () => 1),
      definitionVersion: "qualified-v1",
      metricId: "organic_top10_rate",
      eligibleTotal: expected,
      freshnessConfigured: false,
    },
  );
}

/** Real shared-kernel measured cohort for presentation fixtures that assert a denominator. */
export function measuredOverviewReport(positions: readonly number[]) {
  return aggregateMeasurements(
    positions.map((position, index) => {
      const id = `synthetic-measured-${index}`;
      const scope = { ...fixtureScope, targetId: id };
      return {
        id,
        baseline: null,
        volume: null,
        current: qualifyMeasurement(
          measurement(position, { targetId: id, configuredScope: scope, effectiveScope: scope }),
          { ...fixturePolicy, horizon: 10 },
        ),
      };
    }),
    {
      asOf: fixturePolicy.asOf,
      curve: Array.from({ length: 10 }, () => 1),
      definitionVersion: "qualified-v1",
      metricId: "organic_top10_rate",
      eligibleTotal: positions.length,
    },
  );
}
