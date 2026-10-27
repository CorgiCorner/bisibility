import { describe, expect, it } from "vitest";
import { decimalSortValue, sortTableRows } from "./table-sorting";

describe("exact table sorting", () => {
  it("orders fractional and large values without floating-point conversion", () => {
    const rows = ["9007199254740993.0001", "10", "2", "-0.001", "9007199254740993.0000"].map(
      (value) => ({ value }),
    );
    expect(
      sortTableRows(rows, { field: "amount", direction: "asc" }, (row) =>
        decimalSortValue(row.value),
      ).map((row) => row.value),
    ).toEqual(["-0.001", "2", "10", "9007199254740993.0000", "9007199254740993.0001"]);
  });
  it.each(["asc", "desc"] as const)(
    "keeps missing measurements last when sorting %s",
    (direction) => {
      const rows = [
        { id: "unknown", value: undefined },
        { id: "two", value: 2 },
        { id: "ten", value: 10 },
      ];
      const sorted = sortTableRows(rows, { field: "amount", direction }, (row) => row.value);
      expect(sorted.at(-1)?.id).toBe("unknown");
      expect(sorted[0].id).toBe(direction === "asc" ? "two" : "ten");
      expect(rows[0].id).toBe("unknown");
    },
  );
  it("places unlimited above finite limits and preserves equal-value order", () => {
    const rows = [
      { id: "unlimited", value: Number.POSITIVE_INFINITY },
      { id: "a", value: decimalSortValue("2.00") },
      { id: "b", value: decimalSortValue("2") },
    ];
    expect(
      sortTableRows(rows, { field: "limit", direction: "asc" }, (row) => row.value).map(
        (row) => row.id,
      ),
    ).toEqual(["a", "b", "unlimited"]);
    expect(
      sortTableRows(rows, { field: "limit", direction: "desc" }, (row) => row.value).map(
        (row) => row.id,
      ),
    ).toEqual(["unlimited", "a", "b"]);
    expect(decimalSortValue("unavailable")).toBeUndefined();
  });
});
