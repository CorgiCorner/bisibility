import { describe, expect, it } from "vitest";
import { gridCoordinates } from "./geodesic";
import { createGridRevision } from "./geometry";

describe("browser-safe grid coordinates", () => {
  it.each([1, 3, 5, 7] as const)("matches the stored ordered geometry for size %i", (size) => {
    const input = { center: { latitude: "0", longitude: "179.9999" }, size, spacingMetres: 100 };
    const grid = createGridRevision({ ...input, revisionId: "preview-test" });
    expect(gridCoordinates(input)).toEqual(
      grid.points.map(({ row, column, ordinal, point }) => ({
        row,
        column,
        ordinal,
        coordinate: point.coordinate,
      })),
    );
  });
  it("rejects unsupported dimensions and polar extents instead of showing a guessed preview", () => {
    const input = {
      center: { latitude: "89.9999999", longitude: "0" },
      size: 3 as const,
      spacingMetres: 100,
    };
    expect(() => gridCoordinates(input)).toThrow("pole");
    expect(() => gridCoordinates({ ...input, spacingMetres: 0 })).toThrow("Unsupported");
  });
});
