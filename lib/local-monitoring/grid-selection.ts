import { createGridRevision } from "./geometry";
import { compareCodeUnits, contentKey } from "./key";
import { executionTargetKey } from "./target-key";
import type { ExecutionTargetV1, GridRevision } from "./types";

function freezeSelection(grid: GridRevision, input: readonly ExecutionTargetV1[], subset: boolean) {
  const canonical = createGridRevision({
    revisionId: grid.revisionId,
    center: grid.center,
    size: grid.size,
    spacingMetres: grid.spacingMetres,
  });
  const invalidPoint =
    grid.points.length !== canonical.points.length ||
    grid.points.some((item, index) => {
      const expected = canonical.points[index];
      return (
        item.ordinal !== expected.ordinal ||
        item.row !== expected.row ||
        item.column !== expected.column ||
        item.point.version !== 1 ||
        item.point.geometryModel !== canonical.geometryModel ||
        item.point.precision !== 7 ||
        item.point.revisionId !== expected.point.revisionId ||
        item.point.revisionKey !== expected.point.revisionKey ||
        item.point.contentHash !== expected.point.contentHash ||
        item.point.coordinate.latitude !== expected.point.coordinate.latitude ||
        item.point.coordinate.longitude !== expected.point.coordinate.longitude
      );
    });
  if (
    grid.revisionKey !== canonical.revisionKey ||
    grid.contentHash !== canonical.contentHash ||
    grid.version !== 1 ||
    grid.precision !== 7 ||
    grid.geometryModel !== canonical.geometryModel ||
    grid.center.latitude !== canonical.center.latitude ||
    grid.center.longitude !== canonical.center.longitude ||
    invalidPoint
  )
    throw new Error("Invalid immutable grid revision");
  if (
    (!subset && input.length !== grid.points.length) ||
    !input.length ||
    input.length > grid.points.length
  )
    throw new Error("Expected one immutable target per grid point");
  const expectedPoints = new Set(grid.points.map(({ point }) => point.revisionKey));
  const selectedPoints = new Set(input.map(({ pointRevision }) => pointRevision));
  if (
    expectedPoints.size !== grid.points.length ||
    selectedPoints.size !== input.length ||
    [...selectedPoints].some((key) => !expectedPoints.has(key))
  )
    throw new Error("Grid point scope mismatch");
  const targets = input
    .map((target) =>
      Object.freeze({
        target: Object.freeze(structuredClone(target)),
        key: executionTargetKey(target),
      }),
    )
    .sort((a, b) => compareCodeUnits(a.key, b.key));
  const commonScope = (target: ExecutionTargetV1) =>
    executionTargetKey({ ...target, pointRevision: "common-point-scope" });
  if (targets.some(({ target }) => commonScope(target) !== commonScope(targets[0].target)))
    throw new Error("Mixed keyword, surface or policy scope in grid report");
  return Object.freeze({
    gridRevisionKey: grid.revisionKey,
    selectionKey: contentKey(subset ? "grid-subset-selection-v1" : "grid-selection-v1", [
      grid.revisionKey,
      targets.map(({ key }) => key),
    ]),
    targets: Object.freeze(targets),
  });
}

/** Existing full Cartesian contract remains strict. */
export function freezeGridSelection(grid: GridRevision, input: readonly ExecutionTargetV1[]) {
  return freezeSelection(grid, input, false);
}
/** Explicit original-point subset; unselected points are outside its denominator. */
export function freezeGridSubsetSelection(grid: GridRevision, input: readonly ExecutionTargetV1[]) {
  return freezeSelection(grid, input, true);
}
