"use client";

import { displayTime } from "@/components/admin/AdminPrimitives";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type {
  InstanceAdminAuditPage,
  InstanceAdminAuditResult,
} from "@/lib/queries/instance-admin-audit";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type AdminAuditRow = InstanceAdminAuditPage["entries"][number];
type AuditTranslations = ReturnType<typeof useTranslations<"instanceAdmin.audit">>;

function AuditResultCell({ result }: Readonly<{ result: InstanceAdminAuditResult }>) {
  const t = useTranslations("instanceAdmin.audit");
  switch (result) {
    case "ok":
      return <StatusPill label={t("resultOk")} size="sm" status="success" />;
    case "failed":
      return <StatusPill label={t("statusFailed")} size="sm" status="failed" />;
    case "blocked":
      return <StatusPill label={t("resultBlocked")} showDot size="sm" status="planned" />;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unhandled audit result: ${exhaustive}`);
    }
  }
}

function auditTarget(row: AdminAuditRow, t: AuditTranslations) {
  return row.targetId ? `${row.targetType}:${row.targetId}` : t("targetUnavailable", row);
}

function adminAuditColumns(
  context: ReturnType<typeof useDateDisplay>,
  t: AuditTranslations,
  unavailable: string,
): readonly DataTableColumn<AdminAuditRow>[] {
  return [
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11.5px] text-fg-muted">
          {displayTime(row.original.createdAt, context, unavailable)}
        </span>
      ),
      header: t("time"),
      id: "time",
      meta: { sortable: true, title: t("time") },
      minSize: 156,
      size: 156,
    },
    {
      accessorFn: (row) => row.actorEmail ?? "",
      cell: ({ row }) => (
        <span className="truncate text-[11px]" title={row.original.actorEmail ?? undefined}>
          {row.original.actorEmail ?? unavailable}
        </span>
      ),
      header: t("actor"),
      id: "actor",
      meta: { flex: 1, sortable: true, title: t("actor") },
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
      header: t("action"),
      id: "action",
      meta: { flex: 1, sortable: true, title: t("action") },
      minSize: 168,
      size: 168,
    },
    {
      accessorFn: (row) => auditTarget(row, t),
      cell: ({ row }) => {
        const target = auditTarget(row.original, t);
        return row.original.targetId ? (
          <span className="inline-flex max-w-full flex-wrap items-center gap-1">
            <span>{row.original.targetType}</span>
            <IdChip
              className="min-w-0 max-w-full border-0 bg-transparent px-0"
              copyLabel={t("copyTargetId", { targetId: row.original.targetId })}
              size="sm"
              value={row.original.targetId}
            />
          </span>
        ) : (
          <span className="text-[11px] text-fg-muted">{target}</span>
        );
      },
      header: t("target"),
      id: "target",
      meta: { flex: 1, sortable: true, title: t("target") },
      minSize: 228,
      size: 228,
    },
    {
      accessorFn: (row) => row.result,
      cell: ({ row }) => <AuditResultCell result={row.original.result} />,
      header: t("result"),
      id: "result",
      meta: { sortable: true, title: t("result") },
      minSize: 92,
      size: 92,
    },
  ];
}

export function AdminAuditDataTable({
  entries,
}: Readonly<{ entries: InstanceAdminAuditPage["entries"] }>) {
  const context = useDateDisplay();
  const t = useTranslations("instanceAdmin.audit");
  const values = useTranslations("instanceAdmin.values");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useMemo(
    () => adminAuditColumns(context, t, values("unavailable")),
    [context, t, values],
  );

  return (
    <DataTable
      ariaLabel={t("tableLabel")}
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
