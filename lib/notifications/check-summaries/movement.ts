import { positionComparisonKey } from "@/lib/checks/position-observations";
import { whereComparableTo } from "@/lib/checks/status";
import {
  objectValue,
  type RecordedMeasurementCheck,
  recordedMeasurement,
} from "@/lib/rank-measurements/recorded-check";

export type MovementCheck = RecordedMeasurementCheck & {
  comparisonAllowed: boolean | null;
  raw: unknown;
};

/** New observations use captured market identity; legacy rows use stored depth/version. */
export function comparableKey(check: MovementCheck) {
  if (check.status !== "completed") return null;
  const recovery = objectValue(objectValue(check.raw)?.recovery);
  if (
    recovery?.comparisonAllowed === false ||
    recovery?.completeness === "partial" ||
    recovery?.completeness === "unresolved"
  )
    return null;
  const normalization = objectValue(objectValue(check.raw)?.normalization);
  if (check.position === null && normalization?.outcome === "indeterminate") return null;
  if (check.observationRun) return positionComparisonKey(check);
  const comparable = whereComparableTo(check);
  return comparable
    ? JSON.stringify([comparable.normalizationVersion, comparable.requestedDepth])
    : null;
}

export function movement(
  current: MovementCheck,
  previous: MovementCheck | null,
  thresholds: { topN: number; positionMove: number },
) {
  const key = comparableKey(current);
  if (current.comparisonAllowed === false || !key || !previous || comparableKey(previous) !== key)
    return { direction: "unchanged" as const, significant: false };
  const before = previous.position,
    after = current.position;
  if (
    (after === null && before !== null && !absenceCovers(current, before)) ||
    (before === null && after !== null && !absenceCovers(previous, after))
  )
    return { direction: "unchanged" as const, significant: false };
  const boundaryKnown =
    absenceCovers(previous, thresholds.topN) && absenceCovers(current, thresholds.topN);
  const crossing =
    boundaryKnown &&
    (before !== null && before <= thresholds.topN) !== (after !== null && after <= thresholds.topN);
  const distance = minimumDistance(current, previous);
  const significant = crossing || distance >= thresholds.positionMove;
  const direction: "up" | "down" | "unchanged" =
    before === after
      ? "unchanged"
      : after === null
        ? "down"
        : before === null || after < before
          ? "up"
          : "down";
  return { direction, significant };
}

function absenceCovers(check: MovementCheck, topN: number) {
  if (check.position !== null) return true;
  const through = absentThrough(check);
  return through !== null && through >= topN;
}

function absentThrough(check: MovementCheck) {
  return check.observationRun
    ? recordedMeasurement(check, "target").completeThrough
    : check.requestedDepth;
}

function minimumDistance(current: MovementCheck, previous: MovementCheck) {
  if (current.position !== null && previous.position !== null)
    return Math.abs(current.position - previous.position);
  if (current.position === null && previous.position === null) return 0;
  const absent = current.position === null ? current : previous;
  const present = current.position ?? previous.position ?? 0;
  return Math.max(0, (absentThrough(absent) ?? 0) + 1 - present);
}
