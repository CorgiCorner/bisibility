import type { ReactNode } from "react";

export type DataTableRowKind = "row" | "group" | "section";

export type DataTableRowBase = {
  id: string;
  kind?: DataTableRowKind;
  subRows?: readonly DataTableRowBase[];
};

export type DataTableDensity = "compact" | "standard" | "comfortable";
export type DataTableSortDirection = "asc" | "desc";
export type DataTableSort = { direction: DataTableSortDirection; field: string };
export type DataTableColumnPinning = { left?: string[]; right?: string[] };
export type DataTablePagination = {
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  rowCount: number;
};

export type DataTableColumnMeta = {
  align?: "start" | "end";
  flex?: number;
  lockResize?: boolean;
  lockVisible?: boolean;
  pin?: "left" | "right";
  sortField?: string;
  sortable?: boolean | ((table: { grouped: boolean }) => boolean);
  title?: string;
};

export type DataTableColumn<TRow extends DataTableRowBase> =
  import("@tanstack/react-table").ColumnDef<TRow, unknown> & { meta?: DataTableColumnMeta };

export type DataTableLayoutControlProps = {
  columnSizing?: Record<string, number>;
  columnVisibility?: Record<string, boolean>;
  onColumnSizingChange?: (next: Record<string, number>) => void;
  onColumnVisibilityChange?: (next: Record<string, boolean>) => void;
};

export type DataTableProps<TRow extends DataTableRowBase> = DataTableLayoutControlProps & {
  ariaLabel: string;
  bordered?: boolean;
  columnPinning?: DataTableColumnPinning;
  columns: readonly DataTableColumn<TRow>[];
  defaultExpanded?: "none" | "all";
  density?: DataTableDensity;
  emptyState?: ReactNode;
  expanded?: ReadonlySet<string>;
  footerStart?: ReactNode;
  id: string;
  layout?: "auto" | "fill";
  onDensityChange?: (density: DataTableDensity) => void;
  onExpandedChange?: (next: ReadonlySet<string>) => void;
  onGroupRowClick?: (row: TRow) => void;
  onPaginationChange?: (next: { page: number; pageSize: number }) => void;
  onRowClick?: (row: TRow) => void;
  onSelectionChange?: (next: ReadonlySet<string>) => void;
  onSortingChange: (sort: DataTableSort | null) => void;
  pagination?: DataTablePagination | null;
  paginationMode?: "server" | "client";
  pending?: boolean;
  renderSection?: (row: TRow) => ReactNode;
  rowClassName?: (row: TRow) => string | undefined;
  rows: readonly TRow[];
  selectable?: (row: TRow) => boolean;
  selection?: ReadonlySet<string>;
  sorting: DataTableSort | null;
  sortingMode?: "server" | "client";
};

export type DataTableColumnsMenuProps<TRow extends DataTableRowBase> =
  DataTableLayoutControlProps & {
    ariaLabel?: string;
    columns: readonly DataTableColumn<TRow>[];
    id: string;
  };

export type DataTableDensityMenuProps = {
  ariaLabel?: string;
  density: DataTableDensity;
  onDensityChange: (density: DataTableDensity) => void;
};
