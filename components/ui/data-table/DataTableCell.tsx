"use client";

import { cn } from "@/lib/ui/cn";
import { type Cell, flexRender } from "@tanstack/react-table";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { dataTablePinnedBodyStyle, dataTablePinnedEdge } from "./data-table-pinning";
import { dataTableColumnWidthVariable } from "./data-table-sizing";
import { dataTableCellClassName, dataTablePinnedEdgeClassName } from "./data-table-styles";
import type { DataTableColumn, DataTableRowBase } from "./data-table-types";

type DataTableCellProps<TRow extends DataTableRowBase> = {
  cell: Cell<TRow, unknown>;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function DataTableCell<TRow extends DataTableRowBase>({
  cell,
  children,
  onClick,
  onKeyDown,
}: Readonly<DataTableCellProps<TRow>>) {
  const meta = (cell.column.columnDef as DataTableColumn<TRow>).meta;
  const edge = dataTablePinnedEdge(cell.column, cell.row.getLeftVisibleCells().length);
  const width = `var(${dataTableColumnWidthVariable(cell.column.id)})`;
  const style: CSSProperties = {
    ...dataTablePinnedBodyStyle(cell.column),
    flexBasis: width,
    maxWidth: width,
    minWidth: width,
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require div-based ARIA cells.
    <div
      className={cn(
        dataTableCellClassName,
        meta?.align === "end" ? "justify-end text-right tabular-nums" : "text-left",
        edge && dataTablePinnedEdgeClassName[edge],
      )}
      data-column-id={cell.column.id}
      data-pin-edge={edge}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="cell"
      style={style}
    >
      {children ?? flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  );
}
