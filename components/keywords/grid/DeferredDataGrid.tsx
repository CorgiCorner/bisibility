"use client";

import { tableHeaderClassName } from "@/components/ui";
import type { DataGridProps, GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

type DeferredMuiDataGridProps = DataGridProps & { onReady: () => void };

const MuiDataGrid = dynamic<DeferredMuiDataGridProps>(
  () => import("./MuiDataGrid").then((module) => module.MuiDataGrid),
  { loading: () => null, ssr: false },
);

function cellText<R extends GridValidRowModel>(row: R, column: GridColDef<R>) {
  const value = row[column.field];
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "-";
}

function InitialKeywordTable<R extends GridValidRowModel>({
  columnVisibilityModel,
  columns,
  rows = [],
}: Pick<DataGridProps<R>, "columnVisibilityModel" | "columns" | "rows">) {
  const visibleColumns = columns.filter(
    (column) => columnVisibilityModel?.[column.field] !== false && column.field !== "actions",
  );

  return (
    <div
      data-keyword-grid-fallback
      data-testid="keyword-grid-fallback"
      className="h-full overflow-hidden bg-bg-elev"
    >
      <table
        aria-label="Keywords loading interactive controls"
        className="min-w-[1080px] table-fixed text-left text-[12px]"
      >
        <thead>
          <tr className={`h-[42px] border-b border-border ${tableHeaderClassName}`}>
            {visibleColumns.map((column) => (
              <th key={column.field} scope="col" className="truncate px-3 py-3 font-semibold">
                {column.headerName ?? column.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.id} className="h-[60px] border-b border-border-soft">
              {visibleColumns.map((column) => (
                <td key={column.field} className="truncate px-3 py-5 text-fg">
                  {cellText(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeferredDataGrid<R extends GridValidRowModel>(props: DataGridProps<R>) {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div className="relative h-full">
      {ready ? null : (
        <div className="absolute inset-0 z-10">
          <InitialKeywordTable
            columnVisibilityModel={props.columnVisibilityModel}
            columns={props.columns}
            rows={props.rows}
          />
        </div>
      )}
      <MuiDataGrid {...props} onReady={handleReady} />
    </div>
  );
}
