"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type {
  DataTableColumn,
  DataTableDensity,
  DataTablePagination,
  DataTableSort,
} from "@/components/ui/data-table/data-table-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ReactNode } from "react";
import { KeywordNoRowsOverlay, type KeywordNoRowsState } from "./KeywordTableStatus";

type KeywordGridViewportProps = {
  columnSizing: Record<string, number>;
  columns: readonly DataTableColumn<KeywordRow>[];
  columnVisibility: Record<string, boolean>;
  density: DataTableDensity;
  footerStart?: ReactNode;
  id: string;
  noRowsState?: KeywordNoRowsState;
  onColumnSizingChange: (next: Record<string, number>) => void;
  onColumnVisibilityChange: (next: Record<string, boolean>) => void;
  onNavigate: (keywordId: string) => void;
  onPaginationChange: (next: { page: number; pageSize: number }) => void;
  onSelectionChange: (next: ReadonlySet<string>) => void;
  onSortingChange: (next: DataTableSort | null) => void;
  pagination: DataTablePagination;
  paginationMode?: "client" | "server";
  pending?: boolean;
  rows: readonly KeywordRow[];
  selection: ReadonlySet<string>;
  sorting: DataTableSort | null;
  sortingMode?: "client" | "server";
};

export function KeywordGridViewport({
  columnSizing,
  columns,
  columnVisibility,
  density,
  footerStart,
  id,
  noRowsState,
  onColumnSizingChange,
  onColumnVisibilityChange,
  onNavigate,
  onPaginationChange,
  onSelectionChange,
  onSortingChange,
  pagination,
  pending,
  rows,
  selection,
  sorting,
}: Readonly<KeywordGridViewportProps>) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] w-full min-w-0 [&>[role=table]]:border-0"
        data-testid="keywords-grid-viewport"
      >
        <DataTable
          ariaLabel="Rank tracker keywords"
          columnSizing={columnSizing}
          columns={columns}
          columnVisibility={columnVisibility}
          density={density}
          emptyState={<KeywordNoRowsOverlay state={noRowsState} />}
          footerStart={footerStart}
          id={id}
          layout="fill"
          onColumnSizingChange={onColumnSizingChange}
          onColumnVisibilityChange={onColumnVisibilityChange}
          onPaginationChange={onPaginationChange}
          onRowClick={(row) => onNavigate(row.id)}
          onSelectionChange={onSelectionChange}
          onSortingChange={onSortingChange}
          pagination={pagination}
          paginationMode="server"
          pending={pending}
          rows={rows}
          selection={selection}
          sorting={sorting}
          sortingMode="server"
        />
      </div>
    </div>
  );
}
