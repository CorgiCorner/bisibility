import { aggregateMeasurements } from "@/lib/rank-measurements/aggregate";
import { determinate } from "@/lib/rank-measurements/qualify";
import type { MeasurementTarget, ResolvedMeasurement } from "@/lib/rank-measurements/types";
import type { LocalRow } from "./model";

function target(row: LocalRow, value: ResolvedMeasurement): MeasurementTarget {
  return {
    id: row.keywordId,
    current: value.current,
    baseline: value.baseline,
    latestAttempt: value.latestAttempt,
    volume: 1,
  };
}
/** Binary metrics use the generic oracle; paired deltas never certify historical cohort membership. */
export function aggregateLocalRows(rows: readonly LocalRow[], asOf: Date) {
  const base = { definitionVersion: "local-pack-v1", asOf, eligibleTotal: rows.length };
  const presence = aggregateMeasurements(
    rows.map((row) => target(row, row.presence)),
    {
      ...base,
      metricId: "local_pack_presence",
      curve: [1],
    },
  );
  const targetTop3 = aggregateMeasurements(
    rows.map((row) => target(row, row.target)),
    {
      ...base,
      metricId: "local_target_top3",
      curve: [1, 1, 1],
    },
  );
  // The conditional denominator is independently qualified, fresh feature presence in the same cohort.
  const present = rows.filter(
    ({ presence: value }) =>
      value.current?.evidence === "positive" && value.current.freshness !== "stale",
  );
  const conditionalTop3 = aggregateMeasurements(
    present.map((row) => target(row, row.target)),
    {
      ...base,
      eligibleTotal: present.length,
      metricId: "local_target_top3_when_present",
      curve: [1, 1, 1],
    },
  );
  const found = rows.flatMap(({ target: value }) =>
    value.current?.evidence === "positive" &&
    value.current.freshness !== "stale" &&
    value.current.position !== null
      ? [value.current.position]
      : [],
  );
  const measurable = rows.filter(
    ({ presence: value }) => determinate(value.current) && value.current?.freshness !== "stale",
  );
  const matched = measurable.filter(
    ({ target: value }) => determinate(value.current) && value.current?.freshness !== "stale",
  ).length;
  return {
    presence,
    targetTop3,
    conditionalTop3,
    averageFoundSlot: found.length
      ? found.reduce((sum, value) => sum + value, 0) / found.length
      : null,
    averageFoundCount: found.length,
    matchCoverage: measurable.length ? matched / measurable.length : null,
  };
}
