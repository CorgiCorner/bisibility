import { DataTable } from "@/components/ui/data-table/DataTable";
import { useDataTableLayout } from "@/components/ui/data-table/data-table-layout-store";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { DataSyncKind } from "@/lib/schedules/types";
import { useLocale, useTranslations } from "next-intl";
import { DataSyncScheduleSwitch, type SaveDataSyncState } from "./DataSyncScheduleSwitch";
import { type ReadOnlySchedule, ReadOnlyScheduleCell } from "./ReadOnlyScheduleCell";
import type { SchedulesTableRow } from "./schedules-table-columns";

type ReadOnlyRow = { id: string; schedule: ReadOnlySchedule };
type UnifiedRow = SchedulesTableRow | ReadOnlyRow;

/** Existing check cells and actions retain their controller; added kinds retain their own state controls. */
export function UnifiedScheduleTable({
  rows,
  schedules,
  columns,
  group,
  onRowClick,
  syncAccess,
}: Readonly<{
  rows: readonly SchedulesTableRow[];
  schedules: readonly ReadOnlySchedule[];
  columns: readonly DataTableColumn<SchedulesTableRow>[];
  group: "checks" | "data_sync";
  syncAccess?: {
    canUpdateSyncs: readonly DataSyncKind[];
    projectId: string;
    saveState?: SaveDataSyncState;
  };
  onRowClick?: (row: SchedulesTableRow) => void;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const locale = useLocale();
  const layout = useDataTableLayout("schedules-unified");
  const unifiedColumns: DataTableColumn<UnifiedRow>[] = columns.map((column) => ({
    id: column.id,
    header:
      group === "data_sync" && column.id === "next"
        ? t("unified.lastRun")
        : typeof column.header === "string"
          ? column.header
          : "",
    size: column.id === "next" ? 196 : column.size,
    minSize: column.id === "next" ? 180 : column.minSize,
    meta:
      group === "data_sync" && column.id === "next"
        ? { ...column.meta, title: t("unified.lastRun") }
        : column.meta,
    enableSorting: false,
    cell: (context) => {
      const row = context.row.original;
      if ("schedule" in row) {
        if (column.id === "actions" && row.schedule.kind === "data_sync" && syncAccess) {
          return (
            <DataSyncScheduleSwitch
              canUpdate={syncAccess.canUpdateSyncs.includes(row.schedule.sync_kind)}
              projectId={syncAccess.projectId}
              saveState={syncAccess.saveState}
              schedule={row.schedule}
            />
          );
        }
        return (
          <ReadOnlyScheduleCell
            schedule={row.schedule}
            column={column.id ?? ""}
            locale={locale}
            t={t}
          />
        );
      }
      // This branch has an existing check row; its cells only read row.original.
      return typeof column.cell === "function"
        ? column.cell(context as Parameters<typeof column.cell>[0])
        : (column.cell ?? null);
    },
  }));
  return (
    <DataTable
      bordered={false}
      ariaLabel={t(`unified.${group}`)}
      columns={unifiedColumns}
      columnSizing={layout.columnSizing}
      onColumnSizingChange={layout.setColumnSizing}
      id={`schedules-${group}`}
      layout="auto"
      onRowClick={(row) => {
        if (!("schedule" in row)) onRowClick?.(row);
      }}
      rowClickable={(row) => !("schedule" in row) && Boolean(onRowClick)}
      onSortingChange={() => undefined}
      rows={[...rows, ...schedules.map((schedule) => ({ id: schedule.id, schedule }))]}
      sorting={null}
    />
  );
}
