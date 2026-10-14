import { canonicalCoordinate, computedCoordinate, coordinateDegrees } from "./coordinates";
import type { Coordinate } from "./types";

const EARTH_RADIUS_METRES = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;

export function geodesicOffset(
  center: Coordinate,
  northMetres: number,
  eastMetres: number,
): Coordinate {
  if (![northMetres, eastMetres].every(Number.isFinite)) throw new Error("Nonfinite grid offset");
  const start = coordinateDegrees(center);
  if (Math.abs(start.latitude) === 90) throw new Error("Polar grid frame is ambiguous");
  const distance = Math.hypot(northMetres, eastMetres);
  const latitude = radians(start.latitude);
  const longitude = radians(start.longitude);
  const angular = distance / EARTH_RADIUS_METRES;
  const poleDistance = radians(90 - Math.abs(start.latitude));
  // Crossing a pole changes the local row/column frame; an extent that does so is unsupported.
  if (angular >= poleDistance) throw new Error("Grid extent reaches a pole");
  if (distance === 0) return canonicalCoordinate(center.latitude, center.longitude);
  const bearing = Math.atan2(eastMetres, northMetres);
  const sinLatitude =
    Math.sin(latitude) * Math.cos(angular) +
    Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing);
  if (Math.abs(sinLatitude) > 1) throw new Error("Ambiguous geodesic destination");
  const destinationLatitude = Math.asin(sinLatitude);
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
      Math.cos(angular) - Math.sin(latitude) * Math.sin(destinationLatitude),
    );
  return computedCoordinate(degrees(destinationLatitude), degrees(destinationLongitude));
}

export function gridCoordinates(input: {
  center: Coordinate;
  size: 1 | 3 | 5 | 7;
  spacingMetres: number;
}) {
  if (
    ![1, 3, 5, 7].includes(input.size) ||
    !Number.isSafeInteger(input.spacingMetres) ||
    input.spacingMetres <= 0
  )
    throw new Error("Unsupported grid size or spacing");
  const center = canonicalCoordinate(input.center.latitude, input.center.longitude);
  const half = (input.size - 1) / 2;
  const coordinates = new Set<string>();
  return Array.from({ length: input.size * input.size }, (_, ordinal) => {
    const row = Math.floor(ordinal / input.size);
    const column = ordinal % input.size;
    const coordinate = geodesicOffset(
      center,
      (half - row) * input.spacingMetres,
      (column - half) * input.spacingMetres,
    );
    const key = JSON.stringify([coordinate.latitude, coordinate.longitude]);
    if (coordinates.has(key)) throw new Error("Grid points collapse at selected precision");
    coordinates.add(key);
    return { ordinal, row, column, coordinate };
  });
}
