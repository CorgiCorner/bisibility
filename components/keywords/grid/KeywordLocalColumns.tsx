"use client";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { RankTrackerLocalFact } from "@/lib/queries/rank-tracker-local-model";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

export function LocalMeasurementCell({
  row,
  fact,
  presence = false,
}: {
  row: KeywordRow;
  fact?: RankTrackerLocalFact;
  presence?: boolean;
}) {
  const t = useTranslations("projectRankTracker.localList"),
    format = useFormatter();
  const parent = marketGridParent(row);
  if (parent)
    return (
      <span>
        {t("expandTargets", { count: format.number(parent.aggregate.activeTargetCount) })}
      </span>
    );
  const point = presence ? fact?.presence : fact?.target;
  const text =
    point?.evidence === "positive"
      ? presence
        ? t("present")
        : point.position !== null && Number.isSafeInteger(point.position) && point.position > 0
          ? t("slotValue", { position: format.number(point.position) })
          : t("unknown")
      : point?.evidence === "known_absent"
        ? t(presence ? "absent" : "outside")
        : t("unknown");
  return (
    <span className="grid gap-1">
      <span>{text}</span>
      {point?.freshness !== "fresh" ? (
        <span className="text-xs text-fg-muted">
          {t(point?.freshness === "stale" ? "stale" : "freshnessUnknown")}
        </span>
      ) : null}
    </span>
  );
}
export function LocalTimeCell({ row, fact }: { row: KeywordRow; fact?: RankTrackerLocalFact }) {
  const t = useTranslations("projectRankTracker.localList"),
    format = useFormatter();
  if (marketGridParent(row)) return <span>{t("targetTimes")}</span>;
  const date = fact?.target?.observedAt,
    attempt = fact?.latestAttempt;
  const status =
    attempt?.status === "failed"
      ? "failed"
      : attempt?.status === "running"
        ? "running"
        : attempt?.status === "completed"
          ? "completed"
          : "unknown";
  return (
    <span className="grid gap-1">
      {date ? (
        <time dateTime={date}>
          {format.dateTime(new Date(date), { dateStyle: "medium", timeStyle: "short" })}
        </time>
      ) : (
        <span>{t("neverObserved")}</span>
      )}
      {attempt ? (
        <span className="text-xs text-fg-muted">
          {t(`attempt.${status}`)}
          {attempt.recordedAt ? (
            <>
              {" "}
              ·{" "}
              <time dateTime={attempt.recordedAt}>
                {format.dateTime(new Date(attempt.recordedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
/** Switch the existing table's projection; never reinterpret organic position as business slot. */
export function useKeywordLocalColumns(
  columns: readonly DataTableColumn<KeywordRow>[],
  facts: readonly RankTrackerLocalFact[],
) {
  const t = useTranslations("projectRankTracker.localList");
  return useMemo(() => {
    const byId = new Map(facts.map((fact) => [fact.keywordId, fact]));
    const result = columns
      .filter((column) => !["change", "sparkline", "targetRanking"].includes(String(column.id)))
      .map((column) => {
        if (column.id === "position")
          return {
            ...column,
            header: t("slot"),
            meta: { ...column.meta, title: t("slot") },
            accessorFn: (row: KeywordRow) => byId.get(row.id)?.target?.position ?? null,
            cell: ({ row }: { row: { original: KeywordRow } }) => (
              <LocalMeasurementCell row={row.original} fact={byId.get(row.original.id)} />
            ),
          };
        if (column.id === "lastChecked")
          return {
            ...column,
            header: t("observationAttempt"),
            meta: { ...column.meta, title: t("observationAttempt") },
            cell: ({ row }: { row: { original: KeywordRow } }) => (
              <LocalTimeCell row={row.original} fact={byId.get(row.original.id)} />
            ),
          };
        return column;
      });
    const presence: DataTableColumn<KeywordRow> = {
      id: "localPresence",
      header: t("presence"),
      meta: { title: t("presence"), sortable: false },
      size: 180,
      minSize: 150,
      cell: ({ row }) => (
        <LocalMeasurementCell row={row.original} fact={byId.get(row.original.id)} presence />
      ),
    };
    result.splice(2, 0, presence);
    return result;
  }, [columns, facts, t]);
}
