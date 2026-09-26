import type { DataTableDensity, DataTableRowKind } from "./data-table-types";

const DATA_TABLE_ROW_HEIGHTS = {
  compact: 56,
  comfortable: 78,
  standard: 68,
} satisfies Record<DataTableDensity, number>;

export const dataTableHeaderHeight = 42;
export const dataTableSectionRowHeight = 36;
/** The pagination footer's single-line height. */
export const dataTableFooterHeight = 52;
/** The floor of the body that holds the empty state. */
export const dataTableEmptyBodyHeight = 112;

export function dataTableRowHeight(
  density: DataTableDensity,
  kind: DataTableRowKind = "row",
): number {
  return kind === "section" ? dataTableSectionRowHeight : DATA_TABLE_ROW_HEIGHTS[density];
}

export type DataTableViewportHeightInput = {
  density: DataTableDensity;
  /** Draws the pagination footer inside the viewport. */
  footer?: boolean;
  /** The most rows the viewport shows before the body scrolls. */
  maxRows: number;
  /** The rows on the current page. */
  rows: number;
};

/**
 * The height, in px, of a `layout="fill"` table that shows up to `maxRows` rows: fewer rows leave
 * no blank space, more rows scroll inside the same height under the sticky header.
 */
export function dataTableViewportHeight({
  density,
  footer = true,
  maxRows,
  rows,
}: DataTableViewportHeightInput): number {
  const body =
    rows === 0
      ? dataTableEmptyBodyHeight
      : Math.min(rows, Math.max(1, maxRows)) * dataTableRowHeight(density);
  return dataTableHeaderHeight + body + (footer ? dataTableFooterHeight : 0);
}
