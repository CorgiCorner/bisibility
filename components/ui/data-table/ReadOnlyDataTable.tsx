"use client";

import { type ReactNode, useMemo } from "react";
import { DataTable } from "./DataTable";
import type { DataTableColumn } from "./data-table-types";

type EvidenceRow = { id: string; cells: readonly ReactNode[] };

/** Read-only evidence keeps the shared table shell and allows complete metadata to wrap. */
export function ReadOnlyDataTable({
  id,
  label,
  headers,
  rows,
}: Readonly<{
  id: string;
  label: string;
  headers: readonly string[];
  rows: readonly EvidenceRow[];
}>) {
  const columns = useMemo<readonly DataTableColumn<EvidenceRow>[]>(
    () =>
      headers.map((header, index) => ({
        id: `evidence-${index}`,
        header,
        accessorFn: (row) => row.cells[index],
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-normal break-words">{row.original.cells[index]}</div>
        ),
        enableSorting: false,
        size: 180,
        minSize: 120,
        meta: { lockResize: true, lockVisible: true },
      })),
    [headers],
  );
  return (
    <DataTable
      id={id}
      ariaLabel={label}
      bordered={false}
      columns={columns}
      rows={rows}
      sorting={null}
      onSortingChange={() => undefined}
      pagination={null}
      rowClassName={() => "h-auto! min-h-14 [&_[role=cell]]:py-3"}
    />
  );
}
