import type { Column } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import { dataTablePinnedOffsetVariable } from "./data-table-sizing";
import type { DataTableRowBase } from "./data-table-types";

type VariableStyle = CSSProperties & Record<string, number | string | undefined>;

export const DATA_TABLE_ROW_BACKGROUND_VARIABLE = "--dt-row-background";

export function dataTablePinnedStyle<TRow extends DataTableRowBase>(
  column: Column<TRow, unknown>,
): VariableStyle {
  const pinned = column.getIsPinned();
  if (!pinned) return {};
  return {
    [pinned]: `var(${dataTablePinnedOffsetVariable(column.id)})`,
    position: "sticky",
    zIndex: 2,
  };
}

export function dataTablePinnedBodyStyle<TRow extends DataTableRowBase>(
  column: Column<TRow, unknown>,
): VariableStyle {
  const pinnedStyle = dataTablePinnedStyle(column);
  if (!column.getIsPinned()) return pinnedStyle;
  const rowBackground = `var(${DATA_TABLE_ROW_BACKGROUND_VARIABLE})`;
  return {
    ...pinnedStyle,
    backgroundColor: "var(--bg-elev)",
    backgroundImage: `linear-gradient(${rowBackground}, ${rowBackground})`,
  };
}

export function dataTablePinnedEdge<TRow extends DataTableRowBase>(
  column: Column<TRow, unknown>,
  leftColumnCount: number,
): "left" | "right" | undefined {
  const pinned = column.getIsPinned();
  if (pinned === "left") {
    return column.getPinnedIndex() === leftColumnCount - 1 ? "left" : undefined;
  }
  if (pinned === "right") return column.getPinnedIndex() === 0 ? "right" : undefined;
  return undefined;
}
