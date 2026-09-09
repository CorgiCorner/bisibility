import { describe, expect, it } from "vitest";
import { dataTableSelectionState, toggleDataTableRowSelection } from "./data-table-selection";
import { testDataTableRows } from "./data-table-test-fixtures";

describe("data table selection", () => {
  const group = testDataTableRows[1];
  const selectable = (row: (typeof testDataTableRows)[number]) => row.id !== "group-leaf-b";

  it("selects exactly the selectable leaves in a group", () => {
    const next = toggleDataTableRowSelection(group, new Set(["outside"]), true, selectable);
    expect([...next].sort()).toEqual(["group-leaf-a", "outside"]);
  });

  it("derives indeterminate state after one selected leaf is removed", () => {
    expect(dataTableSelectionState(group, new Set(["group-leaf-a", "group-leaf-b"]))).toEqual({
      checked: true,
      disabled: false,
      indeterminate: false,
    });
    expect(dataTableSelectionState(group, new Set(["group-leaf-a"]))).toEqual({
      checked: false,
      disabled: false,
      indeterminate: true,
    });
  });
});
