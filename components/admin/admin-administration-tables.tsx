"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";
import { useMemo, useState } from "react";

const count = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: "currency",
});

type ConsumptionRow = InstanceAdminAdministration["topConsumption"][number] & { id: string };

const columns: readonly DataTableColumn<ConsumptionRow>[] = [
  {
    accessorFn: (row) => row.projectId,
    cell: ({ row }) => (
      <IdChip
        className="max-w-full"
        copyLabel={`Copy project ID ${row.original.projectId}`}
        size="sm"
        value={row.original.projectId}
      />
    ),
    header: "Project ID",
    id: "project",
    meta: { flex: 1, sortable: true, title: "Project ID" },
    minSize: 200,
    size: 200,
  },
  {
    accessorFn: (row) => row.providerLabel,
    cell: ({ row }) => (
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{row.original.providerLabel}</span>
        <span className="mt-0.5 block truncate text-[10px] text-fg-muted">
          {row.original.rateBasis}
        </span>
      </span>
    ),
    header: "Provider",
    id: "provider",
    meta: { flex: 1, sortable: true, title: "Provider" },
    minSize: 132,
    size: 132,
  },
  {
    accessorFn: (row) => row.checks,
    cell: ({ row }) => <span>{count.format(row.original.checks)}</span>,
    header: "Checks",
    id: "checks",
    meta: { align: "end", sortable: true, title: "Checks" },
    minSize: 104,
    size: 104,
  },
  {
    accessorFn: (row) => row.billableUnits,
    cell: ({ row }) => <span>{count.format(row.original.billableUnits)}</span>,
    header: "Requests / units",
    id: "units",
    meta: { align: "end", sortable: true, title: "Requests / units" },
    minSize: 144,
    size: 144,
  },
  {
    accessorFn: (row) => (row.referenceCostKnown ? row.referenceCostCents : null),
    cell: ({ row }) => (
      <span>
        {row.original.referenceCostKnown
          ? money.format(row.original.referenceCostCents / 100)
          : "-"}
      </span>
    ),
    header: "Reference cost",
    id: "referenceCost",
    meta: { align: "end", sortable: true, title: "Reference cost" },
    minSize: 140,
    size: 140,
  },
  {
    accessorFn: (row) => row.sharePercent,
    cell: ({ row }) => {
      const share = Math.min(100, Math.max(0, row.original.sharePercent));
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-label={`${row.original.sharePercent.toFixed(1)}% of instance reference cost`}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-sunken"
            role="img"
          >
            <span className="block h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
          </span>
          <span className="min-w-10 text-right text-[10.5px] tabular-nums text-fg-muted">
            {row.original.sharePercent.toFixed(1)}%
          </span>
        </span>
      );
    },
    header: "Share of instance",
    id: "share",
    meta: { flex: 1, sortable: true, title: "Share of instance" },
    minSize: 188,
    size: 188,
  },
];

export function AdminAdministrationConsumptionTable({
  rows,
}: Readonly<{ rows: InstanceAdminAdministration["topConsumption"] }>) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const tableRows = useMemo(
    () => rows.map((row) => ({ ...row, id: `${row.projectId}:${row.provider}` })),
    [rows],
  );

  return (
    <DataTable
      ariaLabel="Top project and provider consumption this month"
      columns={columns}
      id="admin-top-consumption-table"
      layout="auto"
      onSortingChange={setSorting}
      rows={tableRows}
      sorting={sorting}
      sortingMode="client"
    />
  );
}
