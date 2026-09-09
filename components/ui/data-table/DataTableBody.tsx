"use client";

import { cn } from "@/lib/ui/cn";
import type { Column, ColumnPinningState, Row, Table } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, type ReactNode } from "react";
import { DataTableRow } from "./DataTableRow";
import { dataTableHeaderHeight, dataTableRowHeight } from "./data-table-density";
import {
  DATA_TABLE_VIEWPORT_WIDTH_VARIABLE,
  DATA_TABLE_WIDTH_VARIABLE,
  dataTableColumnCssId,
} from "./data-table-sizing";
import type { DataTableColumn, DataTableDensity, DataTableRowBase } from "./data-table-types";
import { DATA_TABLE_SELECTION_COLUMN_ID } from "./use-data-table";

type DataTableBodyProps<TRow extends DataTableRowBase> = {
  columnDefinitions: readonly DataTableColumn<TRow>[];
  columnPinning: ColumnPinningState;
  density: DataTableDensity;
  emptyState?: ReactNode;
  layout: "auto" | "fill";
  onExpandedToggle: (row: TRow) => void;
  onGroupRowClick?: (row: TRow) => void;
  onRowClick?: (row: TRow) => void;
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  pending: boolean;
  renderSection?: (row: TRow) => ReactNode;
  rootId: string;
  rowClassName?: (row: TRow) => string | undefined;
  rows: Row<TRow>[];
  scrollElement: HTMLDivElement | null;
  selectable?: (row: TRow) => boolean;
  selection?: ReadonlySet<string>;
  table: Table<TRow>;
  visibleColumns: readonly Column<TRow, unknown>[];
};

function groupControlsId(rootId: string, rowId: string): string {
  return `${rootId}-children-${dataTableColumnCssId(rowId)}`;
}

function childDomId<TRow extends DataTableRowBase>(
  rootId: string,
  rows: Row<TRow>[],
  index: number,
): string | undefined {
  const row = rows[index];
  if (!row?.parentId || rows[index - 1]?.parentId === row.parentId) return undefined;
  return groupControlsId(rootId, row.parentId);
}

function rowProps<TRow extends DataTableRowBase>(
  props: DataTableBodyProps<TRow>,
  row: Row<TRow>,
  index: number,
) {
  const firstContentColumnId =
    props.table
      .getLeftVisibleLeafColumns()
      .find((column) => column.id !== DATA_TABLE_SELECTION_COLUMN_ID)?.id ??
    props.visibleColumns.find((column) => column.id !== DATA_TABLE_SELECTION_COLUMN_ID)?.id;
  return {
    childDomId: childDomId(props.rootId, props.rows, index),
    columnCount: props.visibleColumns.length,
    density: props.density,
    firstContentColumnId,
    groupControlsId: (rowId: string) => groupControlsId(props.rootId, rowId),
    isLastRow: index === props.rows.length - 1,
    onExpandedToggle: props.onExpandedToggle,
    onGroupRowClick: props.onGroupRowClick,
    onRowClick: props.onRowClick,
    onSelectionChange: props.onSelectionChange,
    renderSection: props.renderSection,
    row,
    rowClassName: props.rowClassName,
    rowIndex: index + 2,
    selectable: props.selectable,
    selection: props.selection,
  };
}

function EmptyBody<TRow extends DataTableRowBase>({
  emptyState,
  visibleColumns,
}: Pick<DataTableBodyProps<TRow>, "emptyState" | "visibleColumns">) {
  if (emptyState === undefined) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: The empty state belongs to the div-based ARIA table.
    <div
      className="sticky left-0 flex min-h-28"
      role="row"
      style={{ width: `var(${DATA_TABLE_VIEWPORT_WIDTH_VARIABLE})` }}
      tabIndex={-1}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: The empty state spans the div-based ARIA table. */}
      <div
        aria-colspan={visibleColumns.length}
        className="flex min-w-0 flex-1 items-center justify-center p-4 [&_[data-empty-state]]:border-0 [&_[data-empty-state]]:bg-transparent"
        role="cell"
      >
        {emptyState}
      </div>
    </div>
  );
}

function AutoDataTableBody<TRow extends DataTableRowBase>(props: DataTableBodyProps<TRow>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: The body is a div-based ARIA rowgroup for virtualization.
    <div
      className={cn("block transition-opacity", props.pending && "opacity-60")}
      data-testid={`${props.rootId}-body`}
      role="rowgroup"
    >
      {props.rows.length === 0 ? (
        <EmptyBody emptyState={props.emptyState} visibleColumns={props.visibleColumns} />
      ) : (
        props.rows.map((row, index) => (
          <DataTableRow {...rowProps(props, row, index)} key={row.id} />
        ))
      )}
    </div>
  );
}

function VirtualDataTableBody<TRow extends DataTableRowBase>(props: DataTableBodyProps<TRow>) {
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: props.rows.length,
    estimateSize: (index) => {
      const row = props.rows[index];
      return dataTableRowHeight(props.density, row?.original.kind ?? "row");
    },
    getItemKey: (index) => props.rows[index]?.id ?? index,
    getScrollElement: () => props.scrollElement,
    overscan: 8,
    scrollMargin: dataTableHeaderHeight,
  });
  const items = virtualizer.getVirtualItems();
  return (
    // biome-ignore lint/a11y/useSemanticElements: The body is a div-based ARIA rowgroup for virtualization.
    <div
      className={cn("relative block shrink-0 transition-opacity", props.pending && "opacity-60")}
      data-testid={`${props.rootId}-body`}
      role="rowgroup"
      style={{
        height: props.rows.length === 0 ? undefined : virtualizer.getTotalSize(),
        minWidth: `var(${DATA_TABLE_WIDTH_VARIABLE})`,
      }}
    >
      {props.rows.length === 0 ? (
        <EmptyBody emptyState={props.emptyState} visibleColumns={props.visibleColumns} />
      ) : (
        items.map((item) => {
          const row = props.rows[item.index];
          if (!row) return null;
          return (
            <DataTableRow
              {...rowProps(props, row, item.index)}
              key={row.id}
              virtualStyle={{
                left: 0,
                position: "absolute",
                top: 0,
                transform: `translateY(${item.start - dataTableHeaderHeight}px)`,
              }}
            />
          );
        })
      )}
    </div>
  );
}

function DataTableBodyInner<TRow extends DataTableRowBase>(props: DataTableBodyProps<TRow>) {
  return props.layout === "fill" ? (
    <VirtualDataTableBody {...props} />
  ) : (
    <AutoDataTableBody {...props} />
  );
}

export const DataTableBody = memo(DataTableBodyInner) as typeof DataTableBodyInner;
