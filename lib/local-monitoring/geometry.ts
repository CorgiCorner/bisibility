import { canonicalCoordinate, computedCoordinate, coordinateDegrees } from "./coordinates";
import { contentKey, requireToken } from "./key";
import {
  type Coordinate,
  GEOMETRY_MODEL,
  type GridPoint,
  type GridRevision,
  type PointRevision,
} from "./types";

const EARTH_RADIUS_METRES = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;

export function createPointRevision(input: {
  revisionId: string;
  latitude: string;
  longitude: string;
}): PointRevision {
  const revisionId = requireToken(input.revisionId, "point revision");
  const coordinate = canonicalCoordinate(input.latitude, input.longitude);
  const contentHash = contentKey("point-content-v1", [
    GEOMETRY_MODEL,
    7,
    coordinate.latitude,
    coordinate.longitude,
  ]);
  return Object.freeze({
    version: 1,
    revisionId,
    revisionKey: contentKey("point-revision-v1", [revisionId, contentHash]),
    contentHash,
    coordinate,
    precision: 7,
    geometryModel: GEOMETRY_MODEL,
  });
}

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

export function createGridRevision(input: {
  revisionId: string;
  center: Coordinate;
  size: 1 | 3 | 5 | 7;
  spacingMetres: number;
}): GridRevision {
  const revisionId = requireToken(input.revisionId, "grid revision");
  if (
    ![1, 3, 5, 7].includes(input.size) ||
    !Number.isSafeInteger(input.spacingMetres) ||
    input.spacingMetres <= 0
  ) {
    throw new Error("Unsupported grid size or spacing");
  }
  const center = canonicalCoordinate(input.center.latitude, input.center.longitude);
  const points: GridPoint[] = [];
  const coordinates = new Set<string>();
  const half = (input.size - 1) / 2;
  for (let row = 0; row < input.size; row += 1) {
    for (let column = 0; column < input.size; column += 1) {
      const coordinate = geodesicOffset(
        center,
        (half - row) * input.spacingMetres,
        (column - half) * input.spacingMetres,
      );
      const coordinateKey = JSON.stringify([coordinate.latitude, coordinate.longitude]);
      if (coordinates.has(coordinateKey))
        throw new Error("Grid points collapse at selected precision");
      coordinates.add(coordinateKey);
      const point = createPointRevision({
        revisionId: contentKey("grid-point-id-v1", [revisionId, row, column]),
        ...coordinate,
      });
      points.push(Object.freeze({ ordinal: points.length, row, column, point }));
    }
  }
  const contentHash = contentKey("grid-content-v1", [
    GEOMETRY_MODEL,
    7,
    center.latitude,
    center.longitude,
    input.size,
    input.spacingMetres,
    points.map(({ point }) => point.contentHash),
  ]);
  return Object.freeze({
    version: 1,
    revisionId,
    revisionKey: contentKey("grid-revision-v1", [revisionId, contentHash]),
    contentHash,
    center,
    size: input.size,
    spacingMetres: input.spacingMetres,
    precision: 7,
    geometryModel: GEOMETRY_MODEL,
    points: Object.freeze(points),
  });
}
