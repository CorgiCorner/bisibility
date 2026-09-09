import { describe, expect, it } from "vitest";
import { flattenDataTableRows, validateDataTableRows } from "./data-table-model";
import { type TestDataTableRow, testDataTableRows } from "./data-table-test-fixtures";

describe("data table row model", () => {
  it("always opens sections and only opens selected groups", () => {
    const collapsed = flattenDataTableRows(testDataTableRows, new Set());
    expect(collapsed.map(({ row }) => row.id)).toEqual([
      "section",
      "section-leaf",
      "group",
      "standalone",
    ]);

    const expanded = flattenDataTableRows(testDataTableRows, new Set(["group"]));
    expect(expanded.map(({ row, depth }) => [row.id, depth])).toEqual([
      ["section", 0],
      ["section-leaf", 1],
      ["group", 0],
      ["group-leaf-a", 1],
      ["group-leaf-b", 1],
      ["standalone", 0],
    ]);
  });

  it("rejects data deeper than one level outside production", () => {
    const rows: readonly TestDataTableRow[] = [
      {
        id: "group",
        kind: "group",
        label: "Group",
        score: 1,
        subRows: [
          {
            id: "nested",
            kind: "group",
            label: "Nested",
            score: 1,
            subRows: [{ id: "too-deep", label: "Too deep", score: 1 }],
          },
        ],
      },
    ];

    expect(() => validateDataTableRows(rows, false)).toThrow(/depth/i);
  });
});
