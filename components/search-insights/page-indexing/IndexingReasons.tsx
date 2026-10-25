"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { IndexingFilters, IndexingGroup, IndexingReport } from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { indexingColors } from "./history-presentation";
import { IndexingTable } from "./IndexingTable";
import { useViewerTimeZone } from "./use-viewer-time-zone";

type ReasonRow = {
  id: string;
  kind: "section" | "row";
  label: string;
  total: number;
  reason?: string;
  oldestResultAt?: Date | null;
  group: IndexingGroup;
};

export function IndexingReasons({
  report,
  onSelect,
}: Readonly<{ report: IndexingReport; onSelect: (value: IndexingFilters) => void }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const maximum = Math.max(
    0,
    ...report.groups.flatMap((group) =>
      group.reasons.filter((reason) => reason.coverageState).map((reason) => reason.total),
    ),
  );
  const rows = useMemo<ReasonRow[]>(
    () =>
      report.groups.flatMap((group) => [
        {
          id: group.group,
          group: group.group,
          kind: "section",
          label: t(`groups.${group.group}`),
          total: group.total,
        },
        ...group.reasons
          .filter((reason) => Boolean(reason.coverageState))
          .map(
            (reason, index): ReasonRow => ({
              id: `${group.group}-${index}`,
              kind: "row",
              group: group.group,
              label:
                reason.coverageState === "Unspecified"
                  ? t("unspecifiedReason")
                  : (reason.coverageState ?? "-"),
              total: reason.total,
              oldestResultAt: reason.oldestResultAt,
              ...(reason.coverageState ? { reason: reason.coverageState } : {}),
            }),
          ),
      ]),
    [report, t],
  );
  const columns = useMemo<DataTableColumn<ReasonRow>[]>(
    () => [
      {
        id: "reason",
        header: t("reason"),
        size: 160,
        meta: { flex: 1 },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block w-full whitespace-normal break-words">
            {row.original.label}
            <span aria-hidden className="mt-1 block h-1 w-full rounded bg-bg-inset">
              <span
                className="block h-full rounded"
                style={{
                  width: `${maximum ? (row.original.total / maximum) * 100 : 0}%`,
                  background: indexingColors[row.original.group],
                }}
              />
            </span>
          </span>
        ),
      },
      {
        id: "total",
        header: t("pages"),
        size: 72,
        meta: { align: "end" },
        enableSorting: false,
        cell: ({ row }) => format.number(row.original.total),
      },
      {
        id: "oldest",
        header: t("asOf"),
        size: 96,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.oldestResultAt
            ? format.dateTime(new Date(row.original.oldestResultAt), {
                timeZone,
                month: "short",
                day: "numeric",
              })
            : "-",
      },
    ],
    [t, format, maximum, timeZone],
  );
  return (
    <SearchInsightsRowsCard
      title={t("reasonsTitle")}
      caption={t("reasonsCaption")}
      expandable={false}
      empty={
        report.checked === 0 &&
        !report.groups.some((group) => group.group === "inspection_failed" && group.total > 0)
      }
      emptyReason={t("nothingInspected")}
    >
      <IndexingTable
        id="indexing-reasons"
        label={t("reasonsTitle")}
        columns={columns}
        rows={rows}
        onRowClick={(row) =>
          row.reason && onSelect({ group: row.group, coverage_state: row.reason })
        }
        renderSection={(row) =>
          row.kind === "section" ? (
            <span className="flex gap-2">
              {row.label}
              <span className="font-normal">{t("pageCount", { count: row.total })}</span>
            </span>
          ) : null
        }
      />
    </SearchInsightsRowsCard>
  );
}
