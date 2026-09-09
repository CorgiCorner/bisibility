"use client";

import { cn } from "@/lib/ui/cn";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { DataTableBody } from "./DataTableBody";
import { DataTableFooter } from "./DataTableFooter";
import { DataTableHeader } from "./DataTableHeader";
import { useDataTableExpansion } from "./data-table-expansion";
import { useDataTableLayout } from "./data-table-layout-store";
import { dataTableRowKind, validateDataTableRows } from "./data-table-model";
import {
  DATA_TABLE_VIEWPORT_WIDTH_VARIABLE,
  DATA_TABLE_WIDTH_VARIABLE,
  dataTableColumnWidthVariable,
  dataTablePinnedOffsetVariable,
} from "./data-table-sizing";
import { dataTableRootClassName } from "./data-table-styles";
import type { DataTableProps, DataTableRowBase } from "./data-table-types";
import { useDataTable } from "./use-data-table";

type DataTableCssProperties = CSSProperties & Record<string, number | string | undefined>;

function useDataTableContainer() {
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node);
    if (!node) return;
    const update = () => setContainerWidth(Math.round(node.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { containerWidth, ref, scrollElement };
}

export function DataTable<TRow extends DataTableRowBase>({
  ariaLabel,
  bordered = true,
  columnPinning,
  columns,
  columnSizing,
  columnVisibility,
  defaultExpanded = "none",
  density = "standard",
  emptyState,
  expanded,
  footerStart,
  id,
  layout = "auto",
  onColumnSizingChange,
  onColumnVisibilityChange,
  onExpandedChange,
  onGroupRowClick,
  onPaginationChange,
  onRowClick,
  onSelectionChange,
  onSortingChange,
  pagination,
  paginationMode = "server",
  pending = false,
  renderSection,
  rowClassName,
  rows,
  selectable,
  selection,
  sorting,
  sortingMode = "server",
}: Readonly<DataTableProps<TRow>>) {
  useMemo(() => {
    validateDataTableRows(rows);
    if (
      process.env.NODE_ENV !== "production" &&
      !renderSection &&
      rows.some((row) => dataTableRowKind(row) === "section")
    ) {
      throw new Error("DataTable renderSection is required when rows include a section");
    }
  }, [renderSection, rows]);
  const persisted = useDataTableLayout(id);
  const expansion = useDataTableExpansion({
    defaultExpanded,
    expanded,
    onExpandedChange,
    rows,
  });
  const container = useDataTableContainer();
  const { page, rowCount, sourceSizing, table } = useDataTable({
    columnPinning,
    columns,
    columnSizing,
    columnVisibility,
    containerWidth: container.containerWidth,
    expanded: expansion.expanded,
    onColumnSizingChange,
    onColumnVisibilityChange,
    pagination,
    paginationMode,
    persistedColumnSizing: persisted.columnSizing,
    persistedColumnVisibility: persisted.columnVisibility,
    rows,
    selectable,
    selection,
    setPersistedColumnSizing: persisted.setColumnSizing,
    setPersistedColumnVisibility: persisted.setColumnVisibility,
    sorting,
    sortingMode,
  });
  const renderedRows = table.getRowModel().rows;
  const selectionRows = useMemo(() => {
    const renderedIds = new Set(renderedRows.map((row) => row.id));
    return renderedRows
      .filter((row) => !row.parentId || !renderedIds.has(row.parentId))
      .map((row) => row.original);
  }, [renderedRows]);
  const visibleColumns = table.getVisibleLeafColumns();
  const rootStyle: DataTableCssProperties = {
    [DATA_TABLE_VIEWPORT_WIDTH_VARIABLE]: container.containerWidth
      ? `${container.containerWidth}px`
      : "100%",
    [DATA_TABLE_WIDTH_VARIABLE]: `${Math.max(table.getTotalSize(), 1)}px`,
  };
  for (const column of visibleColumns) {
    rootStyle[dataTableColumnWidthVariable(column.id)] = `${column.getSize()}px`;
    const pinned = column.getIsPinned();
    if (pinned) {
      const offset = pinned === "left" ? column.getStart("left") : column.getAfter("right");
      rootStyle[dataTablePinnedOffsetVariable(column.id)] = `${offset}px`;
    }
  }
  const columnPinningState = table.getState().columnPinning;

  return (
    // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA table.
    <div
      aria-busy={pending || undefined}
      aria-colcount={visibleColumns.length}
      aria-label={ariaLabel}
      aria-rowcount={rowCount}
      className={cn(
        dataTableRootClassName,
        !bordered && "border-0",
        layout === "fill" ? "flex h-full flex-col overflow-auto" : "overflow-x-auto",
      )}
      data-layout={layout}
      data-scrolled="false"
      data-testid={id}
      onScroll={(event) => {
        event.currentTarget.dataset.scrolled =
          event.currentTarget.scrollLeft > 0 ? "true" : "false";
      }}
      ref={container.ref}
      role="table"
      style={rootStyle}
    >
      <div className="min-w-full shrink-0" style={{ width: `var(${DATA_TABLE_WIDTH_VARIABLE})` }}>
        <DataTableHeader
          onSelectionChange={onSelectionChange}
          onSortingChange={onSortingChange}
          rows={selectionRows}
          selectable={selectable}
          selection={selection}
          sorting={sorting}
          sourceSizing={sourceSizing}
          table={table}
        />
        <DataTableBody
          columnDefinitions={columns}
          columnPinning={columnPinningState}
          density={density}
          emptyState={emptyState}
          layout={layout}
          onExpandedToggle={expansion.toggle}
          onGroupRowClick={onGroupRowClick}
          onRowClick={onRowClick}
          onSelectionChange={onSelectionChange}
          pending={pending}
          renderSection={renderSection}
          rootId={id}
          rowClassName={rowClassName}
          rows={renderedRows}
          scrollElement={container.scrollElement}
          selectable={selectable}
          selection={selection}
          table={table}
          visibleColumns={visibleColumns}
        />
      </div>
      <DataTableFooter
        footerStart={footerStart}
        layout={layout}
        onPaginationChange={onPaginationChange}
        page={page}
        pagination={pagination}
        rowCount={rowCount}
      />
    </div>
  );
}
