import { dataTableRowKind } from "./data-table-model";
import type { DataTableRowBase } from "./data-table-types";

export type DataTableSelectionState = {
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
};

export function dataTableSelectableLeaves<TRow extends DataTableRowBase>(
  row: TRow,
  selectable: (row: TRow) => boolean = () => true,
): TRow[] {
  const kind = dataTableRowKind(row);
  if (kind === "section") return [];
  if (kind === "row") return selectable(row) ? [row] : [];
  return (row.subRows ?? []).filter(
    (child) => dataTableRowKind(child) === "row" && selectable(child as TRow),
  ) as TRow[];
}

export function dataTablePageLeaves<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  selectable: (row: TRow) => boolean = () => true,
): TRow[] {
  return rows.flatMap((row) => {
    if (dataTableRowKind(row) === "section") {
      return (row.subRows ?? []).filter(
        (child) => dataTableRowKind(child) === "row" && selectable(child as TRow),
      ) as TRow[];
    }
    return dataTableSelectableLeaves(row, selectable);
  });
}

function stateForLeaves(
  leaves: readonly DataTableRowBase[],
  selection: ReadonlySet<string>,
): DataTableSelectionState {
  const selected = leaves.reduce((count, row) => count + Number(selection.has(row.id)), 0);
  return {
    checked: leaves.length > 0 && selected === leaves.length,
    disabled: leaves.length === 0,
    indeterminate: selected > 0 && selected < leaves.length,
  };
}

export function dataTableSelectionState<TRow extends DataTableRowBase>(
  row: TRow,
  selection: ReadonlySet<string>,
  selectable?: (row: TRow) => boolean,
): DataTableSelectionState {
  return stateForLeaves(dataTableSelectableLeaves(row, selectable), selection);
}

export function dataTableHeaderSelectionState<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  selection: ReadonlySet<string>,
  selectable?: (row: TRow) => boolean,
): DataTableSelectionState {
  return stateForLeaves(dataTablePageLeaves(rows, selectable), selection);
}

function toggleLeaves(
  leaves: readonly DataTableRowBase[],
  selection: ReadonlySet<string>,
  selected: boolean,
): Set<string> {
  const next = new Set(selection);
  for (const leaf of leaves) {
    if (selected) next.add(leaf.id);
    else next.delete(leaf.id);
  }
  return next;
}

export function toggleDataTableRowSelection<TRow extends DataTableRowBase>(
  row: TRow,
  selection: ReadonlySet<string>,
  selected: boolean,
  selectable?: (row: TRow) => boolean,
): Set<string> {
  return toggleLeaves(dataTableSelectableLeaves(row, selectable), selection, selected);
}

export function toggleDataTablePageSelection<TRow extends DataTableRowBase>(
  rows: readonly TRow[],
  selection: ReadonlySet<string>,
  selected: boolean,
  selectable?: (row: TRow) => boolean,
): Set<string> {
  return toggleLeaves(dataTablePageLeaves(rows, selectable), selection, selected);
}

export function dataTableSelectionRecord(selection: ReadonlySet<string>): Record<string, boolean> {
  return Object.fromEntries([...selection].map((id) => [id, true]));
}
