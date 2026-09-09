import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { ScheduleEditorMember } from "./ScheduleEditorModel";

export type ScheduleMemberTableRow = ScheduleEditorMember & { id: string };

export const scheduleMemberTableColumns: readonly DataTableColumn<ScheduleMemberTableRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <span className="block truncate text-[12px] font-semibold text-fg">{row.original.name}</span>
    ),
    enableSorting: false,
    header: "Keyword",
    id: "keyword",
    meta: { flex: 2, title: "Keyword" },
    minSize: 160,
    size: 232,
  },
  {
    accessorKey: "targetCount",
    cell: ({ row }) => (
      <span className="text-[12px] tabular-nums text-fg-muted">
        {row.original.targetCount} checks
      </span>
    ),
    enableSorting: false,
    header: "Checks",
    id: "checks",
    meta: { title: "Checks" },
    minSize: 116,
    size: 132,
  },
  {
    cell: ({ row }) => (
      <span className="text-[11.5px] leading-5 text-fg-muted">
        {row.original.pending ? `Moves from ${row.original.sourceName ?? "manual"}` : null}
      </span>
    ),
    enableSorting: false,
    header: "Pending",
    id: "pending",
    meta: { flex: 1, title: "Pending" },
    minSize: 184,
    size: 216,
  },
];
