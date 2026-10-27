"use client";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { PartialEvidenceView } from "@/lib/metering/recovery/evidence-model";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

type PartialRow = Omit<PartialEvidenceView, "kind"> & { evidenceKind: PartialEvidenceView["kind"] };

export function RecoveryPartialEvidence({ rows }: { rows: PartialEvidenceView[] }) {
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const t = useTranslations("instanceAdmin.recovery.evidence");
  const format = useFormatter();
  const columns: DataTableColumn<PartialRow>[] = [
    {
      id: "project",
      accessorFn: (row) => row.project,
      header: t("project"),
      size: 220,
      meta: { sortable: true, flex: 1 },
      cell: ({ row }) => (
        <a className="text-accent-text" href={row.original.checkHref}>
          {row.original.project}
        </a>
      ),
    },
    {
      id: "kind",
      accessorFn: (row) => t(`partialKinds.${row.evidenceKind}`),
      header: t("result"),
      size: 180,
      meta: { sortable: true },
      cell: ({ row }) => t(`partialKinds.${row.original.evidenceKind}`),
    },
    {
      id: "depth",
      accessorFn: (row) => row.returnedDepth ?? undefined,
      sortUndefined: "last",
      header: t("depth"),
      size: 240,
      meta: { sortable: true },
      cell: ({ row }) => row.original.returnedDepth ?? "-",
    },
    {
      id: "created",
      accessorFn: (row) => Date.parse(row.createdAt),
      header: t("createdUtc"),
      size: 280,
      meta: { sortable: true },
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt}>
          {t("utcTimestamp", {
            timestamp: format.dateTime(new Date(row.original.createdAt), {
              dateStyle: "medium",
              timeStyle: "medium",
              timeZone: "UTC",
            }),
          })}
        </time>
      ),
    },
  ];
  return (
    <section className="grid gap-3" aria-label={t("partialTitle")}>
      <h3 className="m-0 text-sm font-semibold">{t("partialTitle")}</h3>
      <p className="m-0 text-xs text-fg-muted">{t("partialHelp")}</p>
      <DataTable
        id="admin-partial-evidence"
        ariaLabel={t("partialTitle")}
        columns={columns}
        rows={rows.map(({ kind, ...row }) => ({ ...row, evidenceKind: kind }))}
        sorting={sorting}
        onSortingChange={setSorting}
        sortingMode="client"
        emptyState={<p className="p-4 text-sm text-fg-muted">{t("empty")}</p>}
      />
    </section>
  );
}
