"use client";

import { Badge, displayTime } from "@/components/admin/AdminPrimitives";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type OpsEvent = InstanceAdminDashboard["ops"]["events"][number];
type OpsEventRow = Omit<OpsEvent, "kind"> & { eventKind: OpsEvent["kind"]; id: string };
type OpsTranslations = ReturnType<typeof useTranslations<"instanceAdmin.opsTable">>;

function opsEventColumns(
  context: ReturnType<typeof useDateDisplay>,
  format: ReturnType<typeof useFormatter>,
  t: OpsTranslations,
  unavailable: string,
): readonly DataTableColumn<OpsEventRow>[] {
  return [
    {
      accessorFn: (row) => row.eventKind,
      cell: ({ row }) => <span>{row.original.eventKind}</span>,
      header: t("kind"),
      id: "kind",
      meta: { flex: 1, sortable: true, title: t("kind") },
      minSize: 180,
      size: 180,
    },
    {
      accessorFn: (row) => row.severity,
      cell: ({ row }) => <Badge status={row.original.severity} />,
      header: t("severity"),
      id: "severity",
      meta: { sortable: true, title: t("severity") },
      minSize: 112,
      size: 112,
    },
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <span className="text-fg-muted">
          {displayTime(row.original.createdAt, context, unavailable)}
        </span>
      ),
      header: t("created"),
      id: "created",
      meta: { flex: 1, sortable: true, title: t("created") },
      minSize: 156,
      size: 156,
    },
    {
      accessorFn: (row) => (row.deliveredAt ? "delivered" : "undelivered"),
      cell: ({ row }) => <Badge status={row.original.deliveredAt ? "delivered" : "undelivered"} />,
      header: t("delivery"),
      id: "delivery",
      meta: { flex: 1, sortable: true, title: t("delivery") },
      minSize: 180,
      size: 180,
    },
    {
      accessorFn: (row) => row.attempts,
      cell: ({ row }) => (
        <span className="text-fg-muted">{format.number(row.original.attempts)}</span>
      ),
      header: t("attempts"),
      id: "attempts",
      meta: { align: "end", sortable: true, title: t("attempts") },
      minSize: 132,
      size: 132,
    },
  ];
}

export function AdminDashboardOpsEventsTable({
  events,
}: Readonly<{ events: InstanceAdminDashboard["ops"]["events"] }>) {
  const context = useDateDisplay();
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.opsTable");
  const values = useTranslations("instanceAdmin.values");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useMemo(
    () => opsEventColumns(context, format, t, values("unavailable")),
    [context, format, t, values],
  );
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
      ariaLabel={t("tableLabel")}
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
