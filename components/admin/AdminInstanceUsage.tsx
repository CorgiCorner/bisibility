"use client";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { InstanceUsagePeriod, InstanceUsageReport } from "@/lib/queries/instance-usage-report";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useAdminTableSort } from "./AdminTableState";
import { formatRecordedUsd } from "./admin-usage-money";
import { InstanceUsagePeriodSelect } from "./InstanceUsagePeriodSelect";
import { type InstanceUsageRow, instanceUsageColumns } from "./instance-usage-columns";

export function AdminInstanceUsage({
  report,
  period,
  projects = false,
}: Readonly<{
  report: InstanceUsageReport | null;
  period: InstanceUsagePeriod;
  projects?: boolean;
}>) {
  const t = useTranslations("instanceAdmin.instanceUsage"),
    locale = useLocale(),
    format = useFormatter();
  const [sorting, setSorting] = useAdminTableSort(projects ? "consumption" : "ledger");
  const rows: InstanceUsageRow[] = report
    ? projects
      ? report.topProjects.map((row) => ({
          ...row,
          id: JSON.stringify([row.projectId, row.provider]),
        }))
      : report.providers.map((row) => ({ ...row, id: row.provider }))
    : [];
  return (
    <div className="mt-4 min-w-0" data-instance-usage-period={period}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-fg-muted">{t("scope")}</p>
        <InstanceUsagePeriodSelect period={period} />
      </div>
      {report ? (
        <>
          <dl className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fg-muted">{t("operations")}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {format.number(report.totals.operations)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-fg-muted">{t("cost")}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">
                {report.totals.costUsdUnits === null
                  ? t("unknown")
                  : formatRecordedUsd(report.totals.costUsdUnits, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("unknownEntries")}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {format.number(report.totals.unknownOperations)}
              </dd>
            </div>
          </dl>
          <DataTable
            bordered={false}
            ariaLabel={projects ? t("topTable") : t("providerTable")}
            id={projects ? "admin-instance-top-consumption" : "admin-instance-provider-usage"}
            layout="auto"
            columns={instanceUsageColumns(t, locale, projects)}
            rows={rows}
            sorting={sorting}
            onSortingChange={setSorting}
            sortingMode="client"
            emptyState={<p className="p-4 text-xs text-fg-muted">{t("empty")}</p>}
          />
          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">
            {projects ? t("topNote") : t("note")}
          </p>
        </>
      ) : (
        <p className="mt-4 text-xs text-fg-muted" role="status">
          {t("unavailable")}
        </p>
      )}
    </div>
  );
}
