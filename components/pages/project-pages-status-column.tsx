"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip, type StatusChipTone } from "@/components/ui/StatusChip";
import type { ProjectPageStatus } from "@/lib/pages/types";
import type { useTranslations } from "next-intl";
import type { ProjectPagesTableRow } from "./project-pages-columns";

const STATUS_TONE = {
  gone: "neutral",
  in_snapshot: "positive",
  new: "attention",
  redirected: "neutral",
  removed: "neutral",
} as const satisfies Record<ProjectPageStatus["kind"], StatusChipTone>;

function statusLabel(
  status: ProjectPageStatus,
  t: ReturnType<typeof useTranslations<"projectPages">>,
) {
  const day = status.day ?? 1;
  if (status.kind === "in_snapshot") return t("status.in_snapshot");
  if (status.kind === "new") return t("status.new", { day });
  if (status.kind === "redirected") return t("status.redirected", { day });
  if (status.kind === "gone") return t("status.gone", { day });
  return t("status.removed", { day });
}

export function pageStatusColumn(
  t: ReturnType<typeof useTranslations<"projectPages">>,
): DataTableColumn<ProjectPagesTableRow> {
  return {
    cell: ({ row }) => {
      const status = row.original.status;
      if (!status) return <span className="text-fg-muted">-</span>;
      return (
        <StatusChip label={statusLabel(status, t)} size="sm" tone={STATUS_TONE[status.kind]} />
      );
    },
    header: t("columns.status"),
    id: "status",
    meta: { sortable: false, title: t("columns.status") },
    minSize: 148,
    size: 168,
  };
}
