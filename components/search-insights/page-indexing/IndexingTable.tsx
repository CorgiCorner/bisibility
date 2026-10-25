"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type {
  DataTableColumn,
  DataTableRowBase,
} from "@/components/ui/data-table/data-table-types";
import type { ReactNode } from "react";

export function IndexingTable<Row extends DataTableRowBase>({
  id,
  label,
  columns,
  rows,
  onRowClick,
  renderSection,
}: Readonly<{
  id: string;
  label: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  onRowClick?: (row: Row) => void;
  renderSection?: (row: Row) => ReactNode;
}>) {
  return (
    <DataTable
      ariaLabel={label}
      bordered={false}
      columns={columns}
      density="compact"
      id={id}
      onRowClick={onRowClick}
      onSortingChange={() => undefined}
      pagination={null}
      renderSection={renderSection}
      rowClassName={() => "h-auto! min-h-9 [&_[role=cell]]:py-2"}
      rows={rows}
      sorting={null}
    />
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
