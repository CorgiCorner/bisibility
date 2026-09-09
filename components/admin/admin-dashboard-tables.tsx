"use client";

import { Badge, displayTime } from "@/components/admin/AdminPrimitives";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { DateFormat } from "@/lib/dates/format";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useMemo, useState } from "react";

type OpsEvent = InstanceAdminDashboard["ops"]["events"][number];
type OpsEventRow = Omit<OpsEvent, "kind"> & { eventKind: OpsEvent["kind"]; id: string };

function opsEventColumns(dateFormat: DateFormat): readonly DataTableColumn<OpsEventRow>[] {
  return [
    {
      accessorFn: (row) => row.eventKind,
      cell: ({ row }) => <span>{row.original.eventKind}</span>,
      header: "Kind",
      id: "kind",
      meta: { flex: 1, sortable: true, title: "Kind" },
      minSize: 180,
      size: 180,
    },
    {
      accessorFn: (row) => row.severity,
      cell: ({ row }) => <Badge status={row.original.severity} />,
      header: "Severity",
      id: "severity",
      meta: { sortable: true, title: "Severity" },
      minSize: 112,
      size: 112,
    },
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <span className="text-fg-muted">{displayTime(row.original.createdAt, dateFormat)}</span>
      ),
      header: "Created",
      id: "created",
      meta: { flex: 1, sortable: true, title: "Created" },
      minSize: 156,
      size: 156,
    },
    {
      accessorFn: (row) => (row.deliveredAt ? "delivered" : "undelivered"),
      cell: ({ row }) => <Badge status={row.original.deliveredAt ? "delivered" : "undelivered"} />,
      header: "Delivery",
      id: "delivery",
      meta: { flex: 1, sortable: true, title: "Delivery" },
      minSize: 180,
      size: 180,
    },
    {
      accessorFn: (row) => row.attempts,
      cell: ({ row }) => <span className="text-fg-muted">{row.original.attempts}</span>,
      header: "Attempts",
      id: "attempts",
      meta: { align: "end", sortable: true, title: "Attempts" },
      minSize: 132,
      size: 132,
    },
  ];
}

export function AdminDashboardOpsEventsTable({
  dateFormat,
  events,
}: Readonly<{ dateFormat: DateFormat; events: InstanceAdminDashboard["ops"]["events"] }>) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useMemo(() => opsEventColumns(dateFormat), [dateFormat]);
  const rows = useMemo(
    () =>
      events.map(({ kind, ...event }, index) => ({
        ...event,
        eventKind: kind,
        id: `${event.createdAt}:${kind}:${index}`,
      })),
    [events],
  );

  return (
    <DataTable
      ariaLabel="Recent operational events"
      columns={columns}
      id="admin-ops-events-table"
      layout="auto"
      onSortingChange={setSorting}
      rows={rows}
      sorting={sorting}
      sortingMode="client"
    />
  );
}
