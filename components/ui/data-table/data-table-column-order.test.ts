import { describe, expect, it } from "vitest";
import { resolveDataTableColumnOrder } from "./data-table-column-order";

describe("controlled DataTable order", () => {
  const columns = [{ id: "keyword" }, { id: "position" }, { accessorKey: "volume" }];
  it("keeps a saved order and appends a newly introduced column", () => {
    expect(resolveDataTableColumnOrder(columns, ["position", "keyword"])).toEqual([
      "position",
      "keyword",
      "volume",
    ]);
  });
  it("ignores removed IDs and duplicates without losing known columns", () => {
    expect(resolveDataTableColumnOrder(columns, ["removed", "volume", "volume"])).toEqual([
      "volume",
      "keyword",
      "position",
    ]);
  });
  it("defaults to the declared registry without mutating either input", () => {
    const requested = Object.freeze(["volume"]);
    expect(resolveDataTableColumnOrder(Object.freeze(columns), requested)).toEqual([
      "volume",
      "keyword",
      "position",
    ]);
    expect(resolveDataTableColumnOrder(columns)).toEqual(["keyword", "position", "volume"]);
    expect(requested).toEqual(["volume"]);
  });
});
