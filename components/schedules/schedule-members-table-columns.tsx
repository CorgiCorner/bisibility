import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { useTranslations } from "next-intl";
import type { ScheduleEditorMember } from "./ScheduleEditorModel";

export type ScheduleMemberTableRow = ScheduleEditorMember & { id: string };

export function scheduleMemberTableColumns(
  t: ReturnType<typeof useTranslations<"projectRuns.schedules">>,
): readonly DataTableColumn<ScheduleMemberTableRow>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="block truncate text-[12px] font-semibold text-fg">
          {row.original.name}
        </span>
      ),
      enableSorting: false,
      header: t("keyword"),
      id: "keyword",
      meta: { flex: 2, title: t("keyword") },
      minSize: 160,
      size: 232,
    },
    {
      accessorKey: "targetCount",
      cell: ({ row }) => (
        <span className="text-[12px] tabular-nums text-fg-muted">
          {t("checks", { count: row.original.targetCount })}
        </span>
      ),
      enableSorting: false,
      header: t("checksLabel"),
      id: "checks",
      meta: { title: t("checksLabel") },
      minSize: 116,
      size: 132,
    },
    {
      cell: ({ row }) => (
        <span className="text-[11.5px] leading-5 text-fg-muted">
          {row.original.pending
            ? t("editor.movesFrom", {
                name: row.original.sourceName ?? t("drawer.manual"),
              })
            : null}
        </span>
      ),
      enableSorting: false,
      header: t("pending"),
      id: "pending",
      meta: { flex: 1, title: t("pending") },
      minSize: 184,
      size: 216,
    },
  ];
}
