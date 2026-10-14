"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useFormatter, useTranslations } from "next-intl";
import { keywordRankView } from "./keyword-rank-quality-view";

export function KeywordRankValue({ row }: Readonly<{ row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  const format = useFormatter();
  const view = keywordRankView(row);
  const value =
    view.currentPosition !== null
      ? t(view.isGroup ? "bestMeasuredPosition" : "currentPosition", {
          position: format.number(view.currentPosition),
        })
      : t(
          view.evidence === "known_absent"
            ? "knownAbsent"
            : view.evidence === "unsupported"
              ? "unsupported"
              : view.evidence === "not_observed"
                ? "notObserved"
                : "currentUnknown",
        );
  const last =
    view.currentPosition === null || view.evidence !== "positive" ? view.lastKnown : null;
  const dateValue = last?.observedAt ?? last?.recordedAt ?? last?.storedAt ?? null;
  const date = dateValue ? new Date(dateValue) : null;
  const validDate = date && Number.isFinite(date.getTime()) ? date : null;
  const dateLabel = validDate
    ? format.dateTime(validDate, { month: "short", day: "numeric", year: "numeric" })
    : t("dateUnknown");
  const history = last
    ? t(
        view.isGroup
          ? "bestRetainedPosition"
          : last.observedAt
            ? "lastKnownObserved"
            : last.recordedAt
              ? "lastKnownRecorded"
              : last.storedAt
                ? "lastKnownStored"
                : "lastKnownUndated",
        { position: format.number(last.position), date: dateLabel },
      )
    : null;
  const counts = view.group?.metric.counts;
  const detail = counts
    ? t("groupQuality", {
        expected: format.number(counts.expected),
        ranked: format.number(counts.ranked),
        unknown: format.number(counts.unknown),
      })
    : view.reason === "current_scope_unavailable"
      ? t("currentScopeUnavailable")
      : view.reason
        ? t("qualificationUnknown")
        : t(`freshness.${view.freshness}`);
  return (
    <div className="grid min-w-0 max-w-full gap-0.5 overflow-hidden text-right leading-tight">
      <Tooltip content={value}>
        <span className="block truncate font-sans tabular-nums text-[13.5px] font-semibold text-fg">
          {value}
        </span>
      </Tooltip>
      {history ? (
        <Tooltip content={history}>
          <span className="block truncate font-sans tabular-nums text-[10.5px] text-fg-muted">
            {history}
          </span>
        </Tooltip>
      ) : null}
      <Tooltip content={detail}>
        <span className="block truncate font-sans text-[10.5px] text-fg-muted">{detail}</span>
      </Tooltip>
    </div>
  );
}
