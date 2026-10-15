"use client";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { SavedAuditPage } from "@/lib/agent-reports/saved-audit-pages";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function SavedAuditPages({ pages }: { pages: SavedAuditPage[] }) {
  const t = useTranslations("projectSiteAudit");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const columns: DataTableColumn<SavedAuditPage>[] = [
    {
      id: "url",
      header: t("columns.0"),
      accessorKey: "url",
      minSize: 220,
      size: 480,
      meta: { flex: 1 },
      cell: ({ row }) => (
        <div className="grid min-w-0 gap-1 py-1 text-[12px]">
          <span className="truncate text-fg" title={row.original.url}>
            {row.original.url}
          </span>
          <span className="truncate text-fg-muted" title={row.original.title ?? undefined}>
            {row.original.title ?? t("notAssessed")}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: t("columns.1"),
      accessorKey: "status",
      minSize: 100,
      size: 120,
      cell: ({ row }) => (
        <span className="text-[12px] tabular-nums">{row.original.status ?? t("unknown")}</span>
      ),
    },
  ];
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <h2 className="m-0 px-4 py-3 text-[14px] font-semibold">{t("savedPages")}</h2>
      <DataTable
        ariaLabel={t("savedPages")}
        bordered={false}
        columns={columns}
        rows={pages}
        id="saved-audit-pages"
        layout="auto"
        sorting={sorting}
        onSortingChange={setSorting}
        sortingMode="client"
      />
    </Card>
  );
}
