import { canonicalCoordinate } from "./coordinates";
import { gridCoordinates } from "./geodesic";
import { contentKey, requireToken } from "./key";
import {
  type Coordinate,
  GEOMETRY_MODEL,
  type GridPoint,
  type GridRevision,
  type PointRevision,
} from "./types";

export { geodesicOffset } from "./geodesic";

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

export function createGridRevision(input: {
  revisionId: string;
  center: Coordinate;
  size: 1 | 3 | 5 | 7;
  spacingMetres: number;
}): GridRevision {
  const revisionId = requireToken(input.revisionId, "grid revision");
  const center = canonicalCoordinate(input.center.latitude, input.center.longitude);
  const points: GridPoint[] = gridCoordinates(input).map(({ ordinal, row, column, coordinate }) => {
    const point = createPointRevision({
      revisionId: contentKey("grid-point-id-v1", [revisionId, row, column]),
      ...coordinate,
    });
    return Object.freeze({ ordinal, row, column, point });
  });
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
