"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import type { useFormatter, useTranslations } from "next-intl";

type ProviderUsageRow = InstanceAdminDashboard["stats"]["providerUsage"][number] & { id: string };
type ProviderUsageTranslations = ReturnType<typeof useTranslations<"instanceAdmin.providerUsage">>;
type NumberFormatter = ReturnType<typeof useFormatter>;

function rateBasisLabel(rateBasis: ProviderUsageRow["rateBasis"], t: ProviderUsageTranslations) {
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

export function adminProviderUsageColumns(
  t: ProviderUsageTranslations,
  format: NumberFormatter,
): readonly DataTableColumn<ProviderUsageRow>[] {
  return [
    {
      accessorFn: (row) => row.providerLabel,
      cell: ({ row }) => (
        <span className="font-semibold text-fg">{row.original.providerLabel}</span>
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
      header: t("completedChecks"),
      id: "checks",
      meta: { align: "end", sortable: true, title: t("completedChecks") },
      minSize: 156,
      size: 156,
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
      accessorFn: (row) => row.rateBasis,
      cell: ({ row }) => (
        <span className="text-[11px] text-fg-muted">
          {rateBasisLabel(row.original.rateBasis, t)}
        </span>
      ),
      header: t("rateBasis"),
      id: "rateBasis",
      meta: { flex: 1, sortable: true, title: t("rateBasis") },
      minSize: 148,
      size: 148,
    },
  ];
}

export function adminProviderUsageRows(
  usage: InstanceAdminDashboard["stats"]["providerUsage"],
): readonly ProviderUsageRow[] {
  return usage.map((row) => ({ ...row, id: row.provider }));
}
