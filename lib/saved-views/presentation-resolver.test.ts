import { describe, expect, it } from "vitest";
import { emptyTablePresentation } from "./presentation-model";
import { movePresentationColumn, resolveTablePresentation } from "./presentation-resolver";

describe("access-filtered presentation registry", () => {
  const registry = {
    version: 2,
    columns: [
      {
        id: "keyword",
        defaultVisible: true,
        lockedVisible: true,
        defaultWidth: 240,
        minWidth: 120,
        maxWidth: 600,
      },
      { id: "position", defaultVisible: true, defaultWidth: 100, minWidth: 80, maxWidth: 200 },
      { id: "new_column", defaultVisible: false, defaultWidth: 100, minWidth: 80, maxWidth: 200 },
    ],
  };
  it("retains valid preferences, restores locked columns, clamps widths and appends new columns", () => {
    const input = {
      ...emptyTablePresentation,
      columnOrder: ["position", "secret_widget", "keyword"],
      sizing: { keyword: 4000, position: 20 },
      visibility: { keyword: false, position: false, secret_widget: true },
    };
    const before = structuredClone(input);
    const result = resolveTablePresentation(registry, input);
    expect(result).toEqual({
      partial: true,
      presentation: {
        version: 1,
        registryVersion: 2,
        columnOrder: ["position", "keyword", "new_column"],
        sizing: { keyword: 600, position: 80, new_column: 100 },
        visibility: { keyword: true, position: false, new_column: false },
      },
    });
    expect(input).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("secret_widget");
  });
  it("moves columns by keyboard without mutating the input or exceeding either edge", () => {
    const order = ["keyword", "position", "new_column"];
    expect(movePresentationColumn(order, "position", "up")).toEqual([
      "position",
      "keyword",
      "new_column",
    ]);
    expect(movePresentationColumn(order, "keyword", "up")).toEqual(order);
    expect(movePresentationColumn(order, "new_column", "down")).toEqual(order);
    expect(order).toEqual(["keyword", "position", "new_column"]);
  });
});
