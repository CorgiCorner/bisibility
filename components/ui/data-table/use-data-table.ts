"use client";

import {
  functionalUpdate,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { dataTableExpandedRecord } from "./data-table-expansion";
import {
  dataTableColumnId,
  dataTableHasGroups,
  dataTableRootIds,
  dataTableRowKind,
  flattenDataTableRows,
} from "./data-table-model";
import { dataTableSelectionRecord } from "./data-table-selection";
import {
  DATA_TABLE_DEFAULT_COLUMN_SIZE,
  DATA_TABLE_DEFAULT_MIN_SIZE,
  distributeDataTableWidths,
  normalizeDataTableSize,
} from "./data-table-sizing";
import { dataTableColumnIsSortable } from "./data-table-sorting";
import type {
  DataTableColumn,
  DataTableLayoutControlProps,
  DataTableProps,
  DataTableRowBase,
} from "./data-table-types";

export const DATA_TABLE_SELECTION_COLUMN_ID = "selection";

const EMPTY_SELECTION = new Set<string>();

type UseDataTableOptions<TRow extends DataTableRowBase> = Pick<
  DataTableProps<TRow>,
  | "columnPinning"
  | "columns"
  | "pagination"
  | "paginationMode"
  | "rows"
  | "selectable"
  | "selection"
  | "sorting"
  | "sortingMode"
> &
  DataTableLayoutControlProps & {
    containerWidth: number;
    expanded: ReadonlySet<string>;
    persistedColumnSizing: Record<string, number>;
    persistedColumnVisibility: Record<string, boolean>;
    setPersistedColumnSizing: (next: Record<string, number>) => void;
    setPersistedColumnVisibility: (next: Record<string, boolean>) => void;
  };

function selectionColumn<TRow extends DataTableRowBase>(): DataTableColumn<TRow> {
  return {
    cell: undefined,
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
    header: undefined,
    id: DATA_TABLE_SELECTION_COLUMN_ID,
    maxSize: 44,
    meta: { lockResize: true, lockVisible: true, pin: "left" },
    minSize: 44,
    size: 44,
  };
}

export function clampDataTablePage(page: number, pageSize: number, rowCount: number): number {
  const pageCount = Math.max(1, Math.ceil(rowCount / Math.max(1, pageSize)));
  return Math.min(pageCount, Math.max(1, page));
}

export function useDataTable<TRow extends DataTableRowBase>(options: UseDataTableOptions<TRow>) {
  const {
    columnPinning,
    columnSizing,
    columnVisibility,
    columns,
    containerWidth,
    expanded,
    onColumnSizingChange,
    onColumnVisibilityChange,
    pagination,
    paginationMode = "server",
    persistedColumnSizing,
    persistedColumnVisibility,
    rows,
    selectable,
    selection,
    setPersistedColumnSizing,
    setPersistedColumnVisibility,
    sorting,
    sortingMode = "server",
  } = options;
  const grouped = useMemo(() => dataTableHasGroups(rows), [rows]);
  const sourceSizing = columnSizing ?? persistedColumnSizing;
  const sourceVisibility = columnVisibility ?? persistedColumnVisibility;
  const tableColumns = useMemo(() => {
    const normalized = columns.map((column) => ({
      ...column,
      enableResizing: column.meta?.lockResize ? false : column.enableResizing,
      enableSorting:
        column.enableSorting !== false && dataTableColumnIsSortable(column.meta?.sortable, grouped),
    }));
    return selection === undefined ? normalized : [selectionColumn<TRow>(), ...normalized];
  }, [columns, grouped, selection]);
  const columnDescriptors = useMemo(
    () =>
      tableColumns.flatMap((column) => {
        const id = dataTableColumnId(column);
        return id
          ? [
              {
                flex: column.meta?.flex,
                id,
                maxSize: column.maxSize,
                minSize: column.minSize,
                size: column.size,
              },
            ]
          : [];
      }),
    [tableColumns],
  );
  const effectiveVisibility = useMemo(() => {
    const next = { ...sourceVisibility };
    for (const column of tableColumns) {
      const id = dataTableColumnId(column);
      if (id && column.meta?.lockVisible) next[id] = true;
    }
    return next;
  }, [sourceVisibility, tableColumns]);
  const resolvedSizing = useMemo(() => {
    const visible = columnDescriptors.filter((column) => effectiveVisibility[column.id] !== false);
    return {
      ...sourceSizing,
      ...distributeDataTableWidths(visible, containerWidth, sourceSizing),
    };
  }, [columnDescriptors, containerWidth, effectiveVisibility, sourceSizing]);
  const defaultPinning = useMemo(
    () => ({
      left: tableColumns.flatMap((column) => {
        const id = dataTableColumnId(column);
        return id && column.meta?.pin === "left" ? [id] : [];
      }),
      right: tableColumns.flatMap((column) => {
        const id = dataTableColumnId(column);
        return id && column.meta?.pin === "right" ? [id] : [];
      }),
    }),
    [tableColumns],
  );
  const effectivePinning = useMemo(
    () => ({
      left: columnPinning?.left ?? defaultPinning.left,
      right: columnPinning?.right ?? defaultPinning.right,
    }),
    [columnPinning, defaultPinning],
  );
  const rootIds = useMemo(() => dataTableRootIds(rows), [rows]);
  const sortColumn = useMemo(
    () =>
      tableColumns.find((column) => {
        const id = dataTableColumnId(column);
        return id && (column.meta?.sortField ?? id) === sorting?.field;
      }),
    [sorting?.field, tableColumns],
  );
  const sortColumnId = sortColumn ? dataTableColumnId(sortColumn) : null;
  const sortingDirection = sorting?.direction;
  const tableSorting: SortingState = useMemo(
    () =>
      sortingDirection && sortColumnId
        ? [{ desc: sortingDirection === "desc", id: sortColumnId }]
        : [],
    [sortColumnId, sortingDirection],
  );
  const expandedState = useMemo(() => dataTableExpandedRecord(rows, expanded), [expanded, rows]);
  const clientRowCount = useMemo(
    () => flattenDataTableRows(rows, expanded).length,
    [expanded, rows],
  );
  const rowCount = paginationMode === "server" && pagination ? pagination.rowCount : clientRowCount;
  const page = pagination ? clampDataTablePage(pagination.page, pagination.pageSize, rowCount) : 1;
  const pageSize = pagination?.pageSize;
  const paginationState = useMemo(
    () => (pageSize === undefined ? undefined : { pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );
  const clientPagination = paginationMode === "client" && pagination != null;

  const commitSizing = useCallback(
    (
      updater: Parameters<
        NonNullable<Parameters<typeof useReactTable<TRow>>[0]["onColumnSizingChange"]>
      >[0],
    ) => {
      const nextResolved = functionalUpdate(updater, resolvedSizing);
      const next = { ...sourceSizing };
      for (const column of columnDescriptors) {
        if (nextResolved[column.id] === resolvedSizing[column.id]) continue;
        if (!Object.hasOwn(nextResolved, column.id)) delete next[column.id];
        else {
          next[column.id] = normalizeDataTableSize(
            nextResolved[column.id],
            column.minSize,
            column.maxSize,
          );
        }
      }
      if (columnSizing === undefined) setPersistedColumnSizing(next);
      onColumnSizingChange?.(next);
    },
    [
      columnDescriptors,
      columnSizing,
      onColumnSizingChange,
      resolvedSizing,
      setPersistedColumnSizing,
      sourceSizing,
    ],
  );
  const commitVisibility = useCallback(
    (
      updater: Parameters<
        NonNullable<Parameters<typeof useReactTable<TRow>>[0]["onColumnVisibilityChange"]>
      >[0],
    ) => {
      const next = functionalUpdate(updater, effectiveVisibility);
      if (columnVisibility === undefined) setPersistedColumnVisibility(next);
      onColumnVisibilityChange?.(next);
    },
    [columnVisibility, effectiveVisibility, onColumnVisibilityChange, setPersistedColumnVisibility],
  );
  const rowSelection: RowSelectionState = useMemo(
    () => dataTableSelectionRecord(selection ?? EMPTY_SELECTION),
    [selection],
  );
  const data = useMemo(() => [...rows], [rows]);
  const table = useReactTable({
    autoResetPageIndex: false,
    columnResizeMode: "onChange",
    columns: tableColumns,
    data,
    defaultColumn: {
      maxSize: Number.MAX_SAFE_INTEGER,
      minSize: DATA_TABLE_DEFAULT_MIN_SIZE,
      size: DATA_TABLE_DEFAULT_COLUMN_SIZE,
    },
    enableMultiSort: false,
    enableRowSelection: (row) =>
      dataTableRowKind(row.original) === "row" && (selectable?.(row.original) ?? true),
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: clientPagination ? getPaginationRowModel() : undefined,
    getRowCanExpand: (row) => dataTableRowKind(row.original) !== "row",
    getRowId: (row) => row.id,
    getSortedRowModel: sortingMode === "client" ? getSortedRowModel() : undefined,
    getSubRows: (row) =>
      rootIds.has(row.id) && dataTableRowKind(row) !== "row"
        ? ([...(row.subRows ?? [])] as TRow[])
        : undefined,
    manualPagination: !clientPagination,
    manualSorting: sortingMode !== "client",
    onColumnSizingChange: commitSizing,
    onColumnVisibilityChange: commitVisibility,
    rowCount: paginationMode === "server" ? pagination?.rowCount : undefined,
    state: {
      columnPinning: effectivePinning,
      columnSizing: resolvedSizing,
      columnVisibility: effectiveVisibility,
      expanded: expandedState,
      pagination: paginationState,
      rowSelection,
      sorting: tableSorting,
    },
  });

  return { page, rowCount, sourceSizing, table };
}
