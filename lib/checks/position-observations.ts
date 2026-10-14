import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import {
  type RecordedMeasurementCheck,
  recordedMeasurement,
} from "@/lib/rank-measurements/recorded-check";

export type PositionObservation = {
  checkedAt: string;
  comparisonKey?: string | null;
  degradedToCountry?: boolean;
  label: string;
  position: number | null;
};

type RecordedCheck = RecordedMeasurementCheck & { checkedAt: Date };

export function positionComparisonKey(check: RecordedMeasurementCheck) {
  return qualifyMeasurement(recordedMeasurement(check, "target"), {
    asOf: new Date(),
    horizon: check.requestedDepth ?? 100,
  }).comparisonKey;
}

/** Display observations even when they cannot support a movement comparison. */
export function positionObservations(checks: readonly RecordedCheck[]): PositionObservation[] {
  return checks
    .filter((check) => check.status === undefined || check.status === "completed")
    .slice()
    .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime())
    .map((check) => ({
      checkedAt: check.checkedAt.toISOString(),
      comparisonKey: positionComparisonKey(check),
      ...(check.degradedToCountry ? { degradedToCountry: true } : {}),
      label: check.checkedAt.toISOString().slice(0, 10),
      position: check.position,
    }));
}

/** Separate lines preserve gaps and avoid joining incompatible measurements. */
export function observationSeries(
  points: readonly { comparisonKey?: string | null; position: number | null }[],
) {
  const segments: (number | null)[][] = [];
  let previousKey: string | null | undefined;
  for (const [index, point] of points.entries()) {
    if (
      index === 0 ||
      point.comparisonKey === null ||
      previousKey === null ||
      point.comparisonKey !== previousKey
    ) {
      segments.push(Array.from({ length: points.length }, () => null));
    }
    const segment = segments.at(-1);
    if (segment) segment[index] = point.position;
    previousKey = point.comparisonKey;
  }
  return segments.filter((segment) => segment.some((position) => position !== null));
}
