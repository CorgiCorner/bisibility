import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import type { useTranslations } from "next-intl";
import type { ScheduleEditorMember } from "./ScheduleEditorModel";

export type ScheduleMemberTableRow = ScheduleEditorMember & { id: string };

export function scheduleMemberTableColumns(
  t: ReturnType<typeof useTranslations<"projectRuns.schedules">>,
  showPending = true,
  onRemove?: (member: ScheduleEditorMember) => void,
  removingId?: string | null,
): readonly DataTableColumn<ScheduleMemberTableRow>[] {
  const columns: DataTableColumn<ScheduleMemberTableRow>[] = [
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
      minSize: 130,
      size: 220,
    },
    {
      cell: ({ row }) => (
        <span className="text-[12px] text-fg-muted">
          {row.original.market && row.original.device
            ? `${row.original.market} × ${row.original.device}`
            : "-"}
        </span>
      ),
      enableSorting: false,
      header: t("editor.marketDevice"),
      id: "market-device",
      meta: { flex: 1, title: t("editor.marketDevice") },
      minSize: 130,
      size: 180,
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
      minSize: 64,
      size: 76,
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
  if (onRemove)
    columns.push({
      cell: ({ row }) => (
        <RowActionsMenu
          ariaLabel={t("lifecycle.archiveActions", { name: row.original.name })}
          items={[
            {
              label: t("editor.removeMember"),
              disabled: removingId != null,
              onSelect: () => onRemove(row.original),
            },
          ]}
        />
      ),
      enableSorting: false,
      header: () => <span className="sr-only">{t("list.actions")}</span>,
      id: "actions",
      meta: {
        align: "end",
        pin: "right",
        lockResize: true,
        lockVisible: true,
        title: t("list.actions"),
      },
      minSize: 64,
      maxSize: 64,
      size: 64,
    });
  return columns.filter((column) => showPending || column.id !== "pending");
}
