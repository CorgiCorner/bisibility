"use client";

import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { DataTable } from "./DataTable";
import { DataTableColumnsMenu } from "./DataTableColumnsMenu";
import { DataTableDensityMenu } from "./DataTableDensityMenu";
import {
  type DataTableStoryRow,
  dataTableStoryColumns,
  dataTableStoryRows,
} from "./data-table-story-fixtures";
import type {
  DataTableColumn,
  DataTableDensity,
  DataTablePagination,
  DataTableSort,
} from "./data-table-types";

export type DataTableStoryHarnessProps = {
  columns?: readonly DataTableColumn<DataTableStoryRow>[];
  defaultExpanded?: "all" | "none";
  density?: DataTableDensity;
  emptyState?: React.ReactNode;
  footerStart?: React.ReactNode;
  id: string;
  layout?: "auto" | "fill";
  pagination?: DataTablePagination | null;
  paginationMode?: "client" | "server";
  pending?: boolean;
  rows?: readonly DataTableStoryRow[];
  showColumnsMenu?: boolean;
  showDensityMenu?: boolean;
  showRemountControl?: boolean;
  sortingMode?: "client" | "server";
};

export function DataTableStoryHarness({
  columns = dataTableStoryColumns,
  defaultExpanded = "none",
  density: initialDensity = "standard",
  emptyState,
  footerStart,
  id,
  layout = "auto",
  pagination: initialPagination = null,
  paginationMode = "server",
  pending = false,
  rows = dataTableStoryRows,
  showColumnsMenu = true,
  showDensityMenu = true,
  showRemountControl = false,
  sortingMode = "server",
}: Readonly<DataTableStoryHarnessProps>) {
  const [density, setDensity] = useState<DataTableDensity>(initialDensity);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        defaultExpanded === "all"
          ? rows.filter((row) => row.kind === "group").map((row) => row.id)
          : [],
      ),
  );
  const [lastRowClick, setLastRowClick] = useState("none");
  const [pagination, setPagination] = useState(initialPagination);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const [tableMount, setTableMount] = useState(0);
  const fill = layout === "fill";

  return (
    <section className="grid min-w-0 gap-3" data-story-harness={id}>
      {showColumnsMenu || showDensityMenu ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showColumnsMenu ? <DataTableColumnsMenu columns={columns} id={id} /> : null}
          {showDensityMenu ? (
            <DataTableDensityMenu density={density} onDensityChange={setDensity} />
          ) : null}
          {showRemountControl ? (
            <Button
              onClick={() => setTableMount((current) => current + 1)}
              size="sm"
              variant="secondary"
            >
              Remount table
            </Button>
          ) : null}
          <span className="text-[11px] text-fg-muted">
            Theme controls remain available in the Storybook corner.
          </span>
        </div>
      ) : null}
      <div className={fill ? "h-[520px] min-h-[420px] min-w-0" : "min-w-0"}>
        <DataTable
          ariaLabel={`${id} table`}
          columns={columns}
          density={density}
          emptyState={emptyState}
          expanded={expanded}
          footerStart={footerStart ?? `${selection.size} selected`}
          id={id}
          key={tableMount}
          layout={layout}
          onDensityChange={setDensity}
          onExpandedChange={setExpanded}
          onPaginationChange={(next) =>
            setPagination((current) => (current ? { ...current, ...next } : current))
          }
          onRowClick={(row) => setLastRowClick(row.id)}
          onSelectionChange={setSelection}
          onSortingChange={setSorting}
          pagination={pagination}
          paginationMode={paginationMode}
          pending={pending}
          renderSection={(row) => row.keyword}
          rows={rows}
          selectable={(row) => row.selectable !== false}
          selection={selection}
          sorting={sorting}
          sortingMode={sortingMode}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-fg-muted">
        <output data-testid={`${id}-sorting`}>
          sort:{sorting ? `${sorting.field}:${sorting.direction}` : "default"}
        </output>
        <output data-testid={`${id}-selection`}>
          selection:{[...selection].sort().join(",") || "none"}
        </output>
        <output data-testid={`${id}-expanded`}>
          expanded:{[...expanded].sort().join(",") || "none"}
        </output>
        <output data-testid={`${id}-pagination`}>
          page:{pagination ? `${pagination.page}:${pagination.pageSize}` : "none"}
        </output>
        <output data-testid={`${id}-density`}>density:{density}</output>
        <output data-testid={`${id}-row-click`}>row:{lastRowClick}</output>
      </div>
    </section>
  );
}
