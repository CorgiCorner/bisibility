"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { MonitorDetail } from "@/lib/local-monitors/contracts";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function MonitorList({
  projectId,
  rows,
}: {
  projectId: string;
  rows: readonly MonitorDetail[];
}) {
  const t = useTranslations("shared.localMonitors");
  const columns: DataTableColumn<MonitorDetail>[] = [
    {
      id: "name",
      header: t("fields.name"),
      cell: ({ row }) => (
        <Link
          className="font-medium text-accent underline-offset-4 hover:underline"
          href={appPath(
            asProjectRef(projectId),
            "settings",
            "business-locations",
            "monitors",
            row.original.id,
          )}
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "state",
      header: t("status"),
      cell: ({ row }) => t(row.original.state === "archived" ? "states.archived" : "states.active"),
    },
    {
      id: "surface",
      header: t("fields.surface"),
      cell: ({ row }) => t(`surfaces.${row.original.axes.surface}`),
    },
    { id: "points", header: t("points"), cell: ({ row }) => row.original.grid.points.length },
    { id: "keywords", header: t("keywords"), cell: ({ row }) => row.original.keywords.length },
    { id: "revision", header: t("revision"), cell: ({ row }) => row.original.revision },
  ];
  return (
    <DataTable
      id="local-monitors"
      ariaLabel={t("title")}
      rows={rows}
      columns={columns}
      sorting={null}
      onSortingChange={() => undefined}
      emptyState={<p className="p-4 text-sm text-fg-muted">{t("empty")}</p>}
    />
  );
}
