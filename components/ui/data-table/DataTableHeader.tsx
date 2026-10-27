"use client";

import { TableSortButton } from "@/components/ui/TableSortButton";
import {
  tableHeaderClassName,
  tableHeaderFrameBorderClassName,
} from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";
import { flexRender, type Header, type Table } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { type CSSProperties, useId } from "react";
import { DataTableResizeHandle } from "./DataTableResizeHandle";
import { DataTableSelectionCheckbox } from "./DataTableSelectionCheckbox";
import { dataTablePinnedEdge, dataTablePinnedStyle } from "./data-table-pinning";
import {
  dataTableHeaderSelectionState,
  toggleDataTablePageSelection,
} from "./data-table-selection";
import { dataTableColumnWidthVariable } from "./data-table-sizing";
import { dataTableHeaderCellClassName, dataTablePinnedEdgeClassName } from "./data-table-styles";
import type { DataTableColumn, DataTableRowBase, DataTableSort } from "./data-table-types";
import { DATA_TABLE_SELECTION_COLUMN_ID } from "./use-data-table";

type DataTableHeaderProps<TRow extends DataTableRowBase> = {
  bordered: boolean;
  hasBody: boolean;
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

export function DataTableHeader<TRow extends DataTableRowBase>({
  bordered,
  hasBody,
  onSelectionChange,
  onSortingChange,
  rows,
  selectable,
  selection,
  sorting,
  sourceSizing,
  table,
}: Readonly<DataTableHeaderProps<TRow>>) {
  const t = useTranslations("shared.controls.dataTable");
  const labelPrefix = useId();
  const headerGroup = table.getHeaderGroups().at(-1);
  const headerSelection = dataTableHeaderSelectionState(rows, selection ?? new Set(), selectable);
  if (!headerGroup) return null;
  const leftColumnCount = table.getLeftVisibleLeafColumns().length;
  return (
    // biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA rowgroup.
    <div className="sticky top-0 z-10 block bg-bg-elev" role="rowgroup">
      {/* biome-ignore lint/a11y/useSemanticElements: Virtualized rows require a div-based ARIA row. */}
      <div
        className={cn(
          tableHeaderClassName,
          "flex h-[42px] font-semibold",
          bordered && tableHeaderFrameBorderClassName,
          // With no body, the table frame or adjacent footer owns the lower boundary.
          !hasBody && "border-b-0",
        )}
        role="row"
        tabIndex={-1}
      >
        {headerGroup.headers.map((header, index) => {
          const definition = header.column.columnDef as DataTableColumn<TRow>;
          const label = headerLabel(header);
          const labelId = `${labelPrefix}-${index}`;
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
              aria-label={
                header.column.id === DATA_TABLE_SELECTION_COLUMN_ID
                  ? t("selectVisibleRows")
                  : undefined
              }
              aria-labelledby={
                header.column.id === DATA_TABLE_SELECTION_COLUMN_ID ? undefined : labelId
              }
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
                  ariaLabel={t("selectVisibleRows")}
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
                <TableSortButton
                  field={definition.meta?.sortField ?? header.column.id}
                  descendingFirst={Boolean(definition.sortDescFirst)}
                  align={definition.meta?.align}
                  label={label}
                  labelId={labelId}
                  onSortingChange={onSortingChange}
                  sorting={sorting}
                >
                  {content}
                </TableSortButton>
              ) : (
                <span className="truncate" id={labelId}>
                  {content}
                </span>
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
