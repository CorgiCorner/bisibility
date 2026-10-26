"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import { dataTableViewportHeight } from "@/components/ui/data-table/data-table-density";
import type {
  DataTableColumn,
  DataTablePagination,
  DataTableRowBase,
  DataTableSort,
} from "@/components/ui/data-table/data-table-types";
import type { ReactNode } from "react";

export function IndexingTable<Row extends DataTableRowBase>({
  id,
  label,
  columns,
  rows,
  onRowClick,
  emptyState,
  renderSection,
  pagination,
  sorting = null,
  onPageChange,
  onSortChange,
  pending = false,
}: Readonly<{
  id: string;
  label: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  onRowClick?: (row: Row) => void;
  emptyState?: ReactNode;
  renderSection?: (row: Row) => ReactNode;
  pagination?: DataTablePagination;
  sorting?: DataTableSort | null;
  onPageChange?: (page: { page: number; pageSize: number }) => void;
  onSortChange?: (sort: DataTableSort | null) => void;
  pending?: boolean;
}>) {
  const table = (
    <DataTable
      ariaLabel={label}
      bordered={false}
      columns={columns}
      density="compact"
      emptyState={emptyState}
      id={id}
      onRowClick={onRowClick}
      onSortingChange={onSortChange ?? (() => undefined)}
      pagination={pagination}
      onPaginationChange={onPageChange}
      layout={pagination ? "fill" : "auto"}
      measureRows={Boolean(pagination)}
      pending={pending}
      renderSection={renderSection}
      rowClassName={() => "h-auto! min-h-9 [&_[role=cell]]:py-2"}
      rows={rows}
      sorting={sorting}
    />
  );
  return pagination ? (
    <div
      key={`${pagination.page}:${pagination.pageSize}:${sorting?.field}:${sorting?.direction}`}
      className="min-w-0"
      style={{
        height: dataTableViewportHeight({
          density: "compact",
          maxRows: 8,
          rows: rows.length,
          footer: true,
        }),
        maxHeight: "70dvh",
      }}
    >
      {table}
    </div>
  ) : (
    table
  );
}

export function IndexingPath({ value }: Readonly<{ value: string }>) {
  return (
    <span className="block min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
      {value.split(/(?<=[/-])/u).map((part, index) => (
        <span key={`${index}:${part}`}>
          {part}
          <wbr />
        </span>
      ))}
    </span>
  );
}
