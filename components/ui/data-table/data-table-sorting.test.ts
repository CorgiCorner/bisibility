import { describe, expect, it } from "vitest";
import { nextDataTableSort, sortedDataTableRows } from "./data-table-sorting";

describe("data table sorting", () => {
  it("cycles ascending, descending, then consumer default", () => {
    const asc = nextDataTableSort(null, "score", false);
    const desc = nextDataTableSort(asc, "score", false);
    expect(asc).toEqual({ direction: "asc", field: "score" });
    expect(desc).toEqual({ direction: "desc", field: "score" });
    expect(nextDataTableSort(desc, "score", false)).toBeNull();
  });

  it("honors descending-first columns", () => {
    const desc = nextDataTableSort(null, "volume", true);
    expect(desc).toEqual({ direction: "desc", field: "volume" });
    expect(nextDataTableSort(desc, "volume", true)).toEqual({
      direction: "asc",
      field: "volume",
    });
  });
});

it("returns every sorted export row with missing values last and stable ties", () => {
  const rows = [
    { id: "high", score: 3 },
    { id: "missing", score: undefined },
    { id: "low", score: 1 },
    { id: "tie", score: 1 },
  ];
  const columns = [{ id: "score", accessorKey: "score", sortUndefined: "last" as const }];
  expect(
    sortedDataTableRows(rows, columns, { field: "score", direction: "asc" }).map((row) => row.id),
  ).toEqual(["low", "tie", "high", "missing"]);
  expect(sortedDataTableRows(rows, columns, null)).toEqual(rows);
});
