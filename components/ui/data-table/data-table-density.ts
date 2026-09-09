import type { DataTableDensity, DataTableRowKind } from "./data-table-types";

const DATA_TABLE_ROW_HEIGHTS = {
  compact: 56,
  comfortable: 78,
  standard: 68,
} satisfies Record<DataTableDensity, number>;

export const dataTableHeaderHeight = 42;
export const dataTableSectionRowHeight = 36;

export function dataTableRowHeight(
  density: DataTableDensity,
  kind: DataTableRowKind = "row",
): number {
  return kind === "section" ? dataTableSectionRowHeight : DATA_TABLE_ROW_HEIGHTS[density];
}
