import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import type { InstanceProviderUsage } from "@/lib/queries/instance-usage-report";
import type { useTranslations } from "next-intl";
import { formatRecordedUsd } from "./admin-usage-money";

export type InstanceUsageRow = InstanceProviderUsage & {
  id: string;
  projectId?: string | null;
  sharePercent?: number | null;
};
type Messages = ReturnType<typeof useTranslations<"instanceAdmin.instanceUsage">>;
function providerLabel(provider: string, t: Messages) {
  if (["historical-unknown", "unknown"].includes(provider)) return t("unknownProvider");
  return (
    ({ dataforseo: "DataForSEO", serpapi: "SerpApi" } as Record<string, string>)[provider] ??
    provider
  );
}

export function instanceUsageColumns(
  t: Messages,
  locale: string,
  projects: boolean,
): DataTableColumn<InstanceUsageRow>[] {
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const columns: DataTableColumn<InstanceUsageRow>[] = [];
  if (projects)
    columns.push({
      id: "project",
      header: t("project"),
      accessorFn: (row) => row.projectId ?? "",
      minSize: 200,
      size: 200,
      meta: { flex: 1 },
      cell: ({ row }) =>
        row.original.projectId ? (
          <IdChip value={row.original.projectId} size="sm" copyLabel={t("copyProject")} />
        ) : (
          <span>{t("unattributed")}</span>
        ),
    });
  columns.push(
    {
      id: "provider",
      header: t("provider"),
      accessorFn: (row) => providerLabel(row.provider, t),
      minSize: 150,
      size: 150,
      meta: { flex: 1 },
      cell: ({ row }) => <span>{providerLabel(row.original.provider, t)}</span>,
    },
    {
      id: "operations",
      header: t("operations"),
      accessorKey: "operations",
      minSize: 110,
      size: 110,
      meta: { align: "end" },
      cell: ({ row }) => <span>{number(row.original.operations)}</span>,
    },
    {
      id: "cost",
      header: t("cost"),
      accessorFn: (row) => (row.costUsdUnits === null ? undefined : BigInt(row.costUsdUnits)),
      sortUndefined: "last",
      minSize: 180,
      size: 180,
      meta: { align: "end", flex: 1 },
      sortingFn: (a, b) => {
        const left = BigInt(a.original.costUsdUnits ?? "0"),
          right = BigInt(b.original.costUsdUnits ?? "0");
        return left < right ? -1 : left > right ? 1 : 0;
      },
      cell: ({ row }) => (
        <span>
          {row.original.costUsdUnits === null
            ? t("unknown")
            : formatRecordedUsd(row.original.costUsdUnits, locale)}
        </span>
      ),
    },
    {
      id: "unknown",
      header: t("unknownEntries"),
      accessorKey: "unknownOperations",
      minSize: 200,
      size: 200,
      meta: { align: "end" },
      cell: ({ row }) => <span>{number(row.original.unknownOperations)}</span>,
    },
  );
  if (projects)
    columns.push({
      id: "share",
      header: t("share"),
      accessorFn: (row) => row.sharePercent ?? undefined,
      sortUndefined: "last",
      minSize: 210,
      size: 210,
      meta: { align: "end" },
      cell: ({ row }) => (
        <span>
          {row.original.sharePercent == null
            ? t("unknown")
            : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(
                row.original.sharePercent / 100,
              )}
        </span>
      ),
    });
  return columns;
}
