"use client";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { MonitorLaunchState, MonitorRun } from "@/lib/local-monitor-launch/result";
import { useFormatter, useTranslations } from "next-intl";

type Row = MonitorRun["items"][number] & {
  id: string;
  label: MonitorLaunchState["labels"][number] | undefined;
};
export function MonitorRunReceipt({
  run,
  labels,
}: {
  run: MonitorRun;
  labels: MonitorLaunchState["labels"];
}) {
  const format = useFormatter();
  const t = useTranslations("shared.localMonitors.manual");
  const columns: DataTableColumn<Row>[] = [
    {
      id: "keyword",
      header: t("keyword"),
      cell: ({ row }) => row.original.label?.keyword ?? t("unknown"),
    },
    {
      id: "point",
      header: t("point"),
      cell: ({ row }) =>
        row.original.label
          ? t("pointNumber", { number: format.number(row.original.label.ordinal + 1) })
          : t("unknown"),
    },
    {
      id: "coordinate",
      header: t("coordinate"),
      cell: ({ row }) =>
        row.original.label
          ? `${row.original.label.latitude}, ${row.original.label.longitude}`
          : t("unknown"),
    },
    {
      id: "status",
      header: t("status"),
      cell: ({ row }) => t(`states.${row.original.resolution}`),
    },
  ];
  const rows = run.items.map((item) => ({
    ...item,
    id: item.targetId,
    label: labels.find((label) => label.targetId === item.targetId),
  }));
  return (
    <section className="space-y-3" aria-label={t("recordedRun")}>
      <h3 className="font-semibold">{t("recordedRun")}</h3>
      <p className="text-sm">
        {t("progress", {
          total: format.number(run.expectedCount),
          complete: format.number(run.counts.complete),
        })}
      </p>
      <p className="text-sm text-fg-muted">{t("receiptHelp")}</p>
      <DataTable
        id="local-monitor-run"
        ariaLabel={t("recordedRun")}
        columns={columns}
        rows={rows}
        sorting={null}
        onSortingChange={() => undefined}
      />
    </section>
  );
}
