import { describe, expect, it } from "vitest";
import { assertMonitorDefinition, buildMonitorDefinition } from "./definition";
import { monitorDefinitionFixture as input, monitorKeywordFixture as keyword } from "./fixture";
import { definitionInputSchema } from "./schema";

const build = (revisionId: string, latitude = "52") =>
  buildMonitorDefinition(
    { ...input, grid: { ...input.grid, latitude } },
    { entityId: "synthetic-entity", keywords: [keyword], revisionId },
  );
describe("persisted monitor definition", () => {
  it("preserves exact point order and geometry and never rejoins old A after A -> B -> A", () => {
    const first = build("revision-A"),
      second = build("revision-B", "53"),
      returned = build("revision-A-again");
    expect(first.grid.points.map(({ ordinal, row, column }) => [ordinal, row, column])).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [3, 1, 0],
      [4, 1, 1],
      [5, 1, 2],
      [6, 2, 0],
      [7, 2, 1],
      [8, 2, 2],
    ]);
    expect(first.grid.contentHash).toBe(returned.grid.contentHash);
    expect(new Set([first, second, returned].map(({ grid }) => grid.revisionKey)).size).toBe(3);
    expect(first.grid.points[0].point.revisionId).not.toBe(
      returned.grid.points[0].point.revisionId,
    );
    expect(assertMonitorDefinition(first)).toEqual(first);
  });
  it("rejects reordering and forged geometry under a retained snapshot", () => {
    const retained = build("revision");
    const reordered = {
      ...retained,
      grid: { ...retained.grid, points: [...retained.grid.points].reverse() },
    };
    const changed = { ...retained, grid: { ...retained.grid, geometryModel: "other" as never } };
    expect(() => assertMonitorDefinition(reordered)).toThrow();
    expect(() => assertMonitorDefinition(changed)).toThrow();
  });
  it("keeps identities explicit and rejects unsafe coordinates, duplicate keywords and invalid surface/rank pairs", () => {
    expect(() =>
      buildMonitorDefinition(
        { ...input, grid: { ...input.grid, latitude: "NaN" } },
        { entityId: "entity", keywords: [keyword], revisionId: "bad" },
      ),
    ).toThrow();
    expect(
      definitionInputSchema.safeParse({
        ...input,
        keywordIds: [keyword.publicId, keyword.publicId],
      }).success,
    ).toBe(false);
    expect(
      definitionInputSchema.safeParse({
        ...input,
        axes: { ...input.axes, rankScale: "finder_organic" },
      }).success,
    ).toBe(false);
    expect(() =>
      buildMonitorDefinition(input, {
        entityId: "entity",
        keywords: [{ ...keyword, device: "mobile" }],
        revisionId: "bad",
      }),
    ).toThrow();
  });
  it("uses the existing 7x7 geometry while bounding the whole keyword x point selection", () => {
    expect(
      definitionInputSchema.safeParse({ ...input, grid: { ...input.grid, size: 7 } }).success,
    ).toBe(true);
    const keys = Array.from(
      { length: 3 },
      (_, i) => `kw_${String.fromCharCode(97 + i)}bcdefghijklmnopqrstuvwx`,
    );
    expect(
      definitionInputSchema.safeParse({
        ...input,
        keywordIds: keys,
        grid: { ...input.grid, size: 7 },
      }).success,
    ).toBe(false);
  });
});
