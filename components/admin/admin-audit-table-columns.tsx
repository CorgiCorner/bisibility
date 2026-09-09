"use client";

import { displayTime } from "@/components/admin/AdminPrimitives";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type { DateFormat } from "@/lib/dates/format";
import type {
  InstanceAdminAuditPage,
  InstanceAdminAuditResult,
} from "@/lib/queries/instance-admin-audit";
import { useMemo, useState } from "react";

type AdminAuditRow = InstanceAdminAuditPage["entries"][number];

function AuditResultCell({ result }: Readonly<{ result: InstanceAdminAuditResult }>) {
  switch (result) {
    case "ok":
      return <StatusPill label="OK" size="sm" status="success" />;
    case "failed":
      return <StatusPill size="sm" status="failed" />;
    case "blocked":
      return <StatusPill label="Blocked" showDot size="sm" status="planned" />;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled audit result: ${exhaustive}`);
    }
  }
}

function auditTarget(row: AdminAuditRow) {
  return row.targetId ? `${row.targetType}:${row.targetId}` : `${row.targetType}:unavailable`;
}

function adminAuditColumns(dateFormat: DateFormat): readonly DataTableColumn<AdminAuditRow>[] {
  return [
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11.5px] text-fg-muted">
          {displayTime(row.original.createdAt, dateFormat)}
        </span>
      ),
      header: "Time",
      id: "time",
      meta: { sortable: true, title: "Time" },
      minSize: 156,
      size: 156,
    },
    {
      accessorFn: (row) => row.actorEmail ?? "",
      cell: ({ row }) => (
        <span className="truncate text-[11px]" title={row.original.actorEmail ?? undefined}>
          {row.original.actorEmail ?? "-"}
        </span>
      ),
      header: "Actor",
      id: "actor",
      meta: { flex: 1, sortable: true, title: "Actor" },
      minSize: 152,
      size: 152,
    },
    {
      accessorFn: (row) => row.action,
      cell: ({ row }) => (
        <span className="truncate text-[11.5px] font-semibold" title={row.original.action}>
          {row.original.action}
        </span>
      ),
      header: "Action",
      id: "action",
      meta: { flex: 1, sortable: true, title: "Action" },
      minSize: 168,
      size: 168,
    },
    {
      accessorFn: auditTarget,
      cell: ({ row }) => {
        const target = auditTarget(row.original);
        return row.original.targetId ? (
          <span className="inline-flex max-w-full flex-wrap items-center gap-1">
            <span>{row.original.targetType}</span>
            <IdChip
              className="min-w-0 max-w-full border-0 bg-transparent px-0"
              copyLabel={`Copy audit target ID ${row.original.targetId}`}
              size="sm"
              value={row.original.targetId}
            />
          </span>
        ) : (
          <span className="text-[11px] text-fg-muted">{target}</span>
        );
      },
      header: "Target",
      id: "target",
      meta: { flex: 1, sortable: true, title: "Target" },
      minSize: 228,
      size: 228,
    },
    {
      accessorFn: (row) => row.result,
      cell: ({ row }) => <AuditResultCell result={row.original.result} />,
      header: "Result",
      id: "result",
      meta: { sortable: true, title: "Result" },
      minSize: 92,
      size: 92,
    },
  ];
}

export function AdminAuditDataTable({
  dateFormat,
  entries,
}: Readonly<{ dateFormat: DateFormat; entries: InstanceAdminAuditPage["entries"] }>) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useMemo(() => adminAuditColumns(dateFormat), [dateFormat]);

  return (
    <DataTable
      ariaLabel="Instance administrator activity"
      columns={columns}
      id="admin-audit-table"
      layout="auto"
      onSortingChange={setSorting}
      rows={entries}
      sorting={sorting}
      sortingMode="client"
    />
  );
}
