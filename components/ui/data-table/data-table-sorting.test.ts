import { describe, expect, it } from "vitest";
import { nextDataTableSort } from "./data-table-sorting";

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
