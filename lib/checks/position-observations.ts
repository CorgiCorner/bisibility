import { whereComparableTo } from "@/lib/checks/status";

export type PositionObservation = {
  checkedAt: string;
  comparisonKey?: string | null;
  degradedToCountry?: boolean;
  label: string;
  position: number | null;
};

type RecordedCheck = {
  checkedAt: Date;
  degradedToCountry?: boolean;
  normalizationVersion: string | null;
  position: number | null;
  requestedDepth: number | null;
  status?: string;
};

export function positionComparisonKey(check: Parameters<typeof whereComparableTo>[0]) {
  const predicate = whereComparableTo(check);
  return predicate
    ? JSON.stringify([predicate.normalizationVersion, predicate.requestedDepth])
    : null;
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
