import { describe, expect, it } from "vitest";
import { canonicalCoordinate } from "./coordinates";
import { createGridRevision, createPointRevision } from "./geometry";

describe("explicit spherical grid revisions", () => {
  it("canonicalizes decimal precision, signed zero, antimeridian and poles", () => {
    expect(canonicalCoordinate("-0.0000000", "180")).toEqual({
      latitude: "0.0000000",
      longitude: "-180.0000000",
    });
    expect(canonicalCoordinate("90", "123.4")).toEqual({
      latitude: "90.0000000",
      longitude: "0.0000000",
    });
    expect(canonicalCoordinate("-90", "-123.4").longitude).toBe("0.0000000");
    expect(() => canonicalCoordinate("0.00000001", "0")).toThrow();
    expect(() => canonicalCoordinate("90.0000001", "0")).toThrow();
    expect(() => canonicalCoordinate("0", "180.0000001")).toThrow();
    expect(() => canonicalCoordinate("1e1", "0")).toThrow();
  });
  it("creates stable ordered points across the antimeridian without mutating center", () => {
    const input = {
      revisionId: "grid-a",
      center: canonicalCoordinate("0", "179.9999"),
      size: 3 as const,
      spacingMetres: 100,
    };
    const original = structuredClone(input);
    const grid = createGridRevision(input);
    expect(createGridRevision(input)).toEqual(grid);
    expect(input).toEqual(original);
    expect(grid.points).toHaveLength(9);
    expect(grid.points.map(({ ordinal }) => ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(grid.points[4].point.coordinate).toEqual(input.center);
    expect(grid.points[5].point.coordinate.longitude.startsWith("-179.")).toBe(true);
    expect(grid.points[0].point.coordinate.latitude.startsWith("0.000")).toBe(true);
    expect(grid.points[8].point.coordinate.latitude.startsWith("-0.000")).toBe(true);
  });
  it("handles near poles and rejects exact polar or crossing extents", () => {
    expect(
      createGridRevision({
        revisionId: "near-pole",
        center: canonicalCoordinate("89.999", "10"),
        size: 3,
        spacingMetres: 1,
      }).points,
    ).toHaveLength(9);
    expect(() =>
      createGridRevision({
        revisionId: "pole",
        center: canonicalCoordinate("90", "10"),
        size: 1,
        spacingMetres: 1,
      }),
    ).toThrow("Polar");
    expect(() =>
      createGridRevision({
        revisionId: "cross-pole",
        center: canonicalCoordinate("89.9999999", "10"),
        size: 3,
        spacingMetres: 1,
      }),
    ).toThrow("pole");
    expect(
      createPointRevision({ revisionId: "pole-only", latitude: "90", longitude: "10" }).coordinate
        .longitude,
    ).toBe("0.0000000");
  });
  it("keeps geometry content distinct from immutable edit/reversion identity", () => {
    const config = {
      center: canonicalCoordinate("52.2297", "21.0122"),
      size: 5 as const,
      spacingMetres: 100,
    };
    const first = createGridRevision({ ...config, revisionId: "edit-1" });
    const expanded = createGridRevision({ ...config, revisionId: "edit-2", size: 7 });
    const returned = createGridRevision({ ...config, revisionId: "edit-3" });
    expect(first.points).toHaveLength(25);
    expect(expanded.points).toHaveLength(49);
    expect(first.contentHash).toBe(returned.contentHash);
    expect(first.revisionKey).not.toBe(returned.revisionKey);
    expect(first.points[12].point.revisionKey).not.toBe(returned.points[12].point.revisionKey);
    expect(new Set(expanded.points.map(({ point }) => point.contentHash)).size).toBe(49);
    expect(expanded.points.length / first.points.length).toBe(1.96);
  });
});
