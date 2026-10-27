"use client";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type {
  DataTableColumn,
  DataTableRowBase,
  DataTableSort,
} from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { RecoveryCase } from "@/lib/metering/recovery/contract";
import { MAX_RECOVERY_BATCH } from "@/lib/metering/recovery/input";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { RecoveryEvidence } from "./RecoveryEvidence";
import { recoveryEvidenceSortValue } from "./recovery-sorting";

type Row = DataTableRowBase & {
  value?: RecoveryCase;
  label?: string;
  subRows?: Row[];
  selected?: boolean;
  selectionDisabled?: boolean;
};
export function RecoveryTable({
  rows,
  selected,
  busy,
  onSelect,
  onDetails,
}: {
  rows: RecoveryCase[];
  selected: string[];
  busy: boolean;
  onSelect: (token: string, checked: boolean) => void;
  onDetails: (row: RecoveryCase) => void;
}) {
  const t = useTranslations("instanceAdmin.recovery");
  const [groupBy, setGroupBy] = useState("none");
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  function label(row: RecoveryCase) {
    if (groupBy === "project") return row.project ?? t("retainedScope");
    if (groupBy === "cause")
      return row.failure ? t(`failureCodes.${row.failure.code}`) : t("noFailure");
    if (groupBy === "action") return row.action ? t(`actions.${row.action}`) : t("needsEvidence");
    return "";
  }
  function leaf(value: RecoveryCase): Row {
    const checked = selected.includes(value.token);
    return {
      id: value.token,
      value,
      selected: checked,
      selectionDisabled:
        busy || !value.action || (!checked && selected.length >= MAX_RECOVERY_BATCH),
    };
  }
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = label(row);
    groups.set(key, [...(groups.get(key) ?? []), leaf(row)]);
  }
  const tableRows: Row[] =
    groupBy === "none"
      ? rows.map(leaf)
      : Array.from(groups, ([label, subRows]) => ({
          id: `group:${groupBy}:${label}`,
          kind: "section",
          label,
          subRows,
        }));
  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: t("select"),
        size: 140,
        minSize: 140,
        meta: { sortable: true, lockResize: true },
        cell: ({ row }) => {
          const value = row.original.value;
          return (
            value && (
              <Checkbox
                aria-label={t("selectCase", {
                  project: value.project ?? t("retainedScope"),
                  provider: value.provider,
                })}
                checked={row.original.selected ?? false}
                disabled={row.original.selectionDisabled}
                onChange={(event) => onSelect(value.token, event.target.checked)}
              />
            )
          );
        },
      },
      {
        id: "project",
        accessorFn: (row) => (row.value ? (row.value.project ?? t("retainedScope")) : undefined),
        sortUndefined: "last",
        header: t("project"),
        size: 224,
        meta: { sortable: true, flex: 1 },
        cell: ({ row }) => {
          const value = row.original.value;
          return (
            value && (
              <div className="min-w-0">
                {value.project ? (
                  <IdChip value={value.project} truncate="middle" size="xs" />
                ) : (
                  t("retainedScope")
                )}
                {value.historical && (
                  <span className="mt-1 block text-xs text-fg-muted">{t("historical")}</span>
                )}
              </div>
            )
          );
        },
      },
      {
        id: "provider",
        accessorFn: (row) => row.value?.provider,
        sortUndefined: "last",
        header: t("provider"),
        size: 130,
        meta: { sortable: true },
        cell: ({ row }) => row.original.value?.provider,
      },
      ...(["send", "work", "accounting"] as const).map((axis) => ({
        id: axis,
        accessorFn: (row: Row) => (row.value ? t(`states.${row.value[axis]}`) : undefined),
        sortUndefined: "last" as const,
        header: t(axis),
        size: axis === "send" ? 260 : 180,
        meta: { sortable: true },
        cell: ({ row }: { row: { original: Row } }) => {
          const value = row.original.value;
          return (
            value && (
              <span
                className={
                  value[axis] === "unknown" || value[axis] === "possibly_sent"
                    ? "text-warning"
                    : "text-fg"
                }
              >
                {t(`states.${value[axis]}`)}
              </span>
            )
          );
        },
      })),
      ...(["classification", "acceptance", "incident", "lookup"] as const).map((column) => ({
        id: column,
        accessorFn: (row: Row) => recoveryEvidenceSortValue(row.value?.evidence, column),
        sortUndefined: "last" as const,
        header: t(`evidence.${column}`),
        size: column === "incident" || column === "lookup" ? 260 : 240,
        meta: { sortable: true },
        cell: ({ row }: { row: { original: Row } }) => (
          <RecoveryEvidence value={row.original.value?.evidence} column={column} />
        ),
      })),
      {
        id: "triage",
        accessorFn: (row) => (row.value ? t(`triageStates.${row.value.triage.status}`) : undefined),
        sortUndefined: "last",
        header: t("triage"),
        size: 165,
        meta: { sortable: true },
        cell: ({ row }) => {
          const value = row.original.value;
          return value && t(`triageStates.${value.triage.status}`);
        },
      },
      {
        id: "details",
        enableSorting: false,
        header: t("details"),
        size: 144,
        meta: { sortable: true },
        cell: ({ row }) => {
          const value = row.original.value;
          return (
            value && (
              <Button size="sm" variant="secondary" onClick={() => onDetails(value)}>
                {t("details")}
              </Button>
            )
          );
        },
      },
    ],
    [t, onSelect, onDetails],
  );
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <MenuSelect
          ariaLabel={t("groupBy")}
          value={groupBy}
          onChange={setGroupBy}
          options={(["none", "project", "cause", "action"] as const).map((value) => ({
            value,
            label: t(`groups.${value}`),
          }))}
        />
        <InfoTooltip text={t("pageGrouping")} />
      </div>
      <DataTable<Row>
        id="admin-task-recovery"
        ariaLabel={t("heading")}
        columns={columns}
        rows={tableRows}
        sorting={sorting}
        onSortingChange={setSorting}
        sortingMode="client"
        defaultExpanded="all"
        layout="auto"
        rowClassName={() => "h-auto! min-h-14 [&_[role=cell]]:py-3"}
        renderSection={(row) => (
          <p className="m-0 font-medium">
            {row.label} ({row.subRows?.length ?? 0})
          </p>
        )}
        emptyState={<p className="p-8 text-center text-sm text-fg-muted">{t("empty")}</p>}
      />
    </div>
  );
}
