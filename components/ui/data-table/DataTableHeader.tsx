"use client";

import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon as CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { flexRender, type Header, type Table } from "@tanstack/react-table";
import type { CSSProperties, ReactNode } from "react";
import { DataTableResizeHandle } from "./DataTableResizeHandle";
import { DataTableSelectionCheckbox } from "./DataTableSelectionCheckbox";
import { dataTablePinnedEdge, dataTablePinnedStyle } from "./data-table-pinning";
import {
  dataTableHeaderSelectionState,
  toggleDataTablePageSelection,
} from "./data-table-selection";
import { dataTableColumnWidthVariable } from "./data-table-sizing";
import { nextDataTableSort } from "./data-table-sorting";
import { dataTableHeaderCellClassName, dataTablePinnedEdgeClassName } from "./data-table-styles";
import type { DataTableColumn, DataTableRowBase, DataTableSort } from "./data-table-types";
import { DATA_TABLE_SELECTION_COLUMN_ID } from "./use-data-table";

type DataTableHeaderProps<TRow extends DataTableRowBase> = {
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  onSortingChange: (sort: DataTableSort | null) => void;
  rows: readonly TRow[];
  selectable?: (row: TRow) => boolean;
  selection?: ReadonlySet<string>;
  sorting: DataTableSort | null;
  sourceSizing: Record<string, number>;
  table: Table<TRow>;
};

function headerLabel<TRow extends DataTableRowBase>(header: Header<TRow, unknown>): string {
  const definition = header.column.columnDef as DataTableColumn<TRow>;
  if (definition.meta?.title) return definition.meta.title;
  if (typeof definition.header === "string") return definition.header;
  return header.column.id;
}

function SortGlyph({ direction }: Readonly<{ direction?: "asc" | "desc" }>) {
  if (direction === "asc") return <CaretUp aria-hidden size={9} weight="regular" />;
  if (direction === "desc") return <CaretDown aria-hidden size={9} weight="regular" />;
  return (
    <span aria-hidden className="grid leading-none">
      <CaretUp className="row-start-1" size={7} weight="regular" />
      <CaretDown className="row-start-2" size={7} weight="regular" />
    </span>
  );
}

function SortableHeader<TRow extends DataTableRowBase>({
  content,
  header,
  label,
  onSortingChange,
  sorting,
}: Readonly<{
  content: ReactNode;
  header: Header<TRow, unknown>;
  label: string;
  onSortingChange: (sort: DataTableSort | null) => void;
  sorting: DataTableSort | null;
}>) {
  const definition = header.column.columnDef as DataTableColumn<TRow>;
  const field = definition.meta?.sortField ?? header.column.id;
  const active = sorting?.field === field ? sorting.direction : undefined;
  const next = nextDataTableSort(sorting, field, Boolean(definition.sortDescFirst));
  const action = next
    ? `Sort ${label} ${next.direction === "asc" ? "ascending" : "descending"}`
    : `Clear ${label} sorting`;
  return (
    <button
      aria-label={action}
      aria-sort={active ? (active === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden p-0 [font:inherit] [letter-spacing:inherit] [text-transform:inherit] hover:text-fg",
        definition.meta?.align === "end" ? "justify-end" : "justify-start",
        active ? "text-accent-text" : "text-fg-muted",
      )}
      onClick={() => onSortingChange(next)}
      type="button"
    >
      <span className="truncate">{content}</span>
      <SortGlyph direction={active} />
    </button>
  );
}

export function DataTableHeader<TRow extends DataTableRowBase>({
  onSelectionChange,
  onSortingChange,
  rows,
  selectable,
  selection,
  sorting,
  sourceSizing,
  table,
}: Readonly<DataTableHeaderProps<TRow>>) {
  const headerGroup = table.getHeaderGroups().at(-1);
  const headerSelection = dataTableHeaderSelectionState(rows, selection ?? new Set(), selectable);
  if (!headerGroup) return null;
  const leftColumnCount = table.getLeftVisibleLeafColumns().length;
  return (
    // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA rowgroup.
    <div className="sticky top-0 z-10 block bg-bg-elev" role="rowgroup">
      {/* biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA row. */}
      <div
        className={cn(tableHeaderClassName, "flex h-[42px] border-t-0 font-semibold")}
        role="row"
        tabIndex={-1}
      >
        {headerGroup.headers.map((header) => {
          const definition = header.column.columnDef as DataTableColumn<TRow>;
          const label = headerLabel(header);
          const edge = dataTablePinnedEdge(header.column, leftColumnCount);
          const width = `var(${dataTableColumnWidthVariable(header.column.id)})`;
          const style: CSSProperties = {
            ...dataTablePinnedStyle(header.column),
            backgroundColor: header.column.getIsPinned() ? "var(--bg-elev)" : undefined,
            flexBasis: width,
            maxWidth: width,
            minWidth: width,
          };
          const content = header.isPlaceholder ? null : typeof header.column.columnDef.header ===
            "string" ? (
            <span data-replay-label>{header.column.columnDef.header}</span>
          ) : (
            flexRender(header.column.columnDef.header, header.getContext())
          );
          const sortable = header.column.getCanSort();
          return (
            // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require div-based ARIA column headers.
            <div
              aria-sort={
                sortable
                  ? sorting?.field === (definition.meta?.sortField ?? header.column.id)
                    ? sorting.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                  : undefined
              }
              className={cn(
                dataTableHeaderCellClassName,
                definition.meta?.align === "end" && "justify-end text-right tabular-nums",
                edge && dataTablePinnedEdgeClassName[edge],
              )}
              data-column-id={header.column.id}
              data-pin-edge={edge}
              key={header.id}
              role="columnheader"
              style={style}
              tabIndex={-1}
              title={definition.meta?.title}
            >
              {header.column.id === DATA_TABLE_SELECTION_COLUMN_ID ? (
                <DataTableSelectionCheckbox
                  {...headerSelection}
                  ariaLabel="Select visible rows"
                  onChange={
                    onSelectionChange
                      ? (checked) =>
                          onSelectionChange(
                            toggleDataTablePageSelection(
                              rows,
                              selection ?? new Set(),
                              checked,
                              selectable,
                            ),
                          )
                      : undefined
                  }
                />
              ) : sortable ? (
                <SortableHeader
                  content={content}
                  header={header}
                  label={label}
                  onSortingChange={onSortingChange}
                  sorting={sorting}
                />
              ) : (
                <span className="truncate">{content}</span>
              )}
              {header.column.getCanResize() ? (
                <DataTableResizeHandle
                  header={header}
                  label={label}
                  userSize={sourceSizing[header.column.id]}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
