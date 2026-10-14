"use client";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { LocalResultPoint } from "@/lib/local-monitor-results/model";
import { useTranslations } from "next-intl";
export function MonitorResultTable({
  points,
  onPoint,
}: {
  points: readonly LocalResultPoint[];
  onPoint: (id: string) => void;
}) {
  const t = useTranslations("shared.localMonitors");
  const columns: DataTableColumn<LocalResultPoint>[] = [
    {
      id: "point",
      header: t("point"),
      cell: ({ row }) => (
        <Button variant="ghost" onClick={() => onPoint(row.original.id)}>
          {row.original.ordinal + 1}
        </Button>
      ),
    },
    { id: "latitude", header: t("fields.latitude"), cell: ({ row }) => row.original.latitude },
    { id: "longitude", header: t("fields.longitude"), cell: ({ row }) => row.original.longitude },
    {
      id: "position",
      header: t("results.rank"),
      cell: ({ row }) => row.original.position ?? t("results.unknown"),
    },
    {
      id: "evidence",
      header: t("results.evidence"),
      cell: ({ row }) => t(`results.evidenceStates.${row.original.evidence}`),
    },
    {
      id: "freshness",
      header: t("results.freshness"),
      cell: ({ row }) => t(`results.freshnessStates.${row.original.freshness}`),
    },
    {
      id: "observedAt",
      header: t("results.observedAt"),
      cell: ({ row }) => row.original.observedAt ?? t("results.unknown"),
    },
    {
      id: "resolution",
      header: t("results.receipt"),
      cell: ({ row }) => t(`manual.states.${row.original.receipt.resolution}`),
    },
  ];
  return (
    <DataTable
      id="local-run-points"
      ariaLabel={t("results.points")}
      columns={columns}
      rows={[...points]}
      sorting={null}
      onSortingChange={() => undefined}
    />
  );
}
