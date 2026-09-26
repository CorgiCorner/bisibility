"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type ConsumptionRow = InstanceAdminAdministration["topConsumption"][number] & { id: string };
type ConsumptionTranslations = ReturnType<
  typeof useTranslations<"instanceAdmin.administration.consumption">
>;
type NumberFormatter = ReturnType<typeof useFormatter>;

function rateBasisLabel(rateBasis: ConsumptionRow["rateBasis"], t: ConsumptionTranslations) {
  switch (rateBasis) {
    case "live_depth":
      return t("rateBasisLiveDepth");
    case "production_plan":
      return t("rateBasisProductionPlan");
    case "unavailable":
      return t("rateBasisUnavailable");
    default: {
      const exhaustive: never = rateBasis;
      return exhaustive;
    }
  }
}

function consumptionColumns(
  t: ConsumptionTranslations,
  format: NumberFormatter,
): readonly DataTableColumn<ConsumptionRow>[] {
  return [
    {
      accessorFn: (row) => row.projectId,
      cell: ({ row }) => (
        <IdChip
          className="max-w-full"
          copyLabel={t("copyProjectId", { projectId: row.original.projectId })}
          size="sm"
          value={row.original.projectId}
        />
      ),
      header: t("projectId"),
      id: "project",
      meta: { flex: 1, sortable: true, title: t("projectId") },
      minSize: 200,
      size: 200,
    },
    {
      accessorFn: (row) => row.providerLabel,
      cell: ({ row }) => (
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">{row.original.providerLabel}</span>
          <span className="mt-0.5 block truncate text-[10px] text-fg-muted">
            {rateBasisLabel(row.original.rateBasis, t)}
          </span>
        </span>
      ),
      header: t("provider"),
      id: "provider",
      meta: { flex: 1, sortable: true, title: t("provider") },
      minSize: 132,
      size: 132,
    },
    {
      accessorFn: (row) => row.checks,
      cell: ({ row }) => <span>{format.number(row.original.checks)}</span>,
      header: t("checks"),
      id: "checks",
      meta: { align: "end", sortable: true, title: t("checks") },
      minSize: 104,
      size: 104,
    },
    {
      accessorFn: (row) => row.billableUnits,
      cell: ({ row }) => <span>{format.number(row.original.billableUnits)}</span>,
      header: t("requestsUnits"),
      id: "units",
      meta: { align: "end", sortable: true, title: t("requestsUnits") },
      minSize: 144,
      size: 144,
    },
    {
      accessorFn: (row) => (row.referenceCostKnown ? row.referenceCostCents : null),
      cell: ({ row }) => (
        <span>
          {row.original.referenceCostKnown
            ? format.number(row.original.referenceCostCents / 100, {
                currency: "USD",
                maximumFractionDigits: 4,
                minimumFractionDigits: 2,
                style: "currency",
              })
            : t("referenceUnknown")}
        </span>
      ),
      header: t("referenceCost"),
      id: "referenceCost",
      meta: { align: "end", sortable: true, title: t("referenceCost") },
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
              aria-label={t("shareAriaLabel", { value: row.original.sharePercent })}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-sunken"
              role="img"
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${share}%` }}
              />
            </span>
            <span className="min-w-10 text-right text-[10.5px] tabular-nums text-fg-muted">
              {t("shareValue", { value: row.original.sharePercent })}
            </span>
          </span>
        );
      },
      header: t("share"),
      id: "share",
      meta: { flex: 1, sortable: true, title: t("share") },
      minSize: 188,
      size: 188,
    },
  ];
}

export function AdminAdministrationConsumptionTable({
  rows,
}: Readonly<{ rows: InstanceAdminAdministration["topConsumption"] }>) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.administration.consumption");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns = useMemo(() => consumptionColumns(t, format), [format, t]);
  const tableRows = useMemo(
    () => rows.map((row) => ({ ...row, id: `${row.projectId}:${row.provider}` })),
    [rows],
  );

  return (
    <DataTable
      bordered={false}
      ariaLabel={t("tableLabel")}
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
