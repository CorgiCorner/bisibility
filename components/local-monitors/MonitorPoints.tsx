"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { MonitorDetail } from "@/lib/local-monitors/contracts";
import { useTranslations } from "next-intl";

type PointRow = MonitorDetail["grid"]["points"][number] & { id: string };
export function MonitorPoints({ monitor }: { monitor: MonitorDetail }) {
  const t = useTranslations("shared.localMonitors");
  const columns: DataTableColumn<PointRow>[] = [
    { id: "ordinal", header: t("point"), cell: ({ row }) => row.original.ordinal + 1 },
    { id: "row", header: t("row"), cell: ({ row }) => row.original.row + 1 },
    { id: "column", header: t("column"), cell: ({ row }) => row.original.column + 1 },
    {
      id: "latitude",
      header: t("fields.latitude"),
      cell: ({ row }) => row.original.point.coordinate.latitude,
    },
    {
      id: "longitude",
      header: t("fields.longitude"),
      cell: ({ row }) => row.original.point.coordinate.longitude,
    },
    {
      id: "result",
      header: t("result"),
      cell: () => <span className="text-fg-muted">{t("resultUnavailable")}</span>,
    },
  ];
  const rows = monitor.grid.points.map((point) => ({ ...point, id: point.point.revisionId }));
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{t("configuredPoints")}</h2>
      <p className="text-sm text-fg-muted">{t("pointHelp")}</p>
      <DataTable
        id="local-monitor-points"
        ariaLabel={t("configuredPoints")}
        columns={columns}
        rows={rows}
        sorting={null}
        onSortingChange={() => undefined}
      />
    </div>
  );
}
