"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { CheckStatusChip } from "@/components/ui/CheckStatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useFormatter, useTranslations } from "next-intl";
import { keywordRankView, keywordRecordedAttempt } from "./keyword-rank-quality-view";

function date(value: string | null | undefined) {
  const result = value ? new Date(value) : null;
  return result && Number.isFinite(result.getTime()) ? result : null;
}

export function KeywordRecordedCheckCell({
  row,
  pending = false,
}: Readonly<{ row: KeywordRow; pending?: boolean }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  const gridT = useTranslations("projectRankTracker.keywordImport.management.grid");
  const format = useFormatter();
  const { readOnly } = useProjectWriteMode();
  const view = keywordRankView(row);
  const attempt = keywordRecordedAttempt(row);
  const recordedAt = date(
    attempt?.recordedAt ?? (!view.quality && !view.group ? row.lastCheckAt : null),
  );
  const observedAt = date(view.quality?.current?.observedAt);
  const label = (value: Date) =>
    format.dateTime(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const status = pending
    ? "running"
    : (attempt?.status ?? (!view.quality && !view.isGroup ? row.lastCheckStatus : null));
  const groupCounts = view.group?.metric.counts;
  return (
    <div className="grid min-w-0 max-w-full gap-1 overflow-hidden py-1 font-sans tabular-nums text-[10.5px] leading-tight text-fg-muted">
      {readOnly ? (
        <CheckStatusChip kind="pending" label={gridT("pausedMigration")} />
      ) : groupCounts ? (
        <Tooltip
          content={t("groupAttemptHealth", {
            failed: format.number(groupCounts.failed),
            expected: format.number(groupCounts.expected),
          })}
        >
          <span className="block truncate">
            {t("groupAttemptHealth", {
              failed: format.number(groupCounts.failed),
              expected: format.number(groupCounts.expected),
            })}
          </span>
        </Tooltip>
      ) : status === "failed" || status === "running" ? (
        <CheckStatusChip kind={status} label={gridT(status)} />
      ) : status === "deferred" ? (
        <span>{t("deferred")}</span>
      ) : null}
      {recordedAt ? (
        <Tooltip
          content={t(attempt ? "recordedAt" : "storedCheckAt", {
            date: format.dateTime(recordedAt, { dateStyle: "full", timeStyle: "long" }),
          })}
        >
          <time className="block truncate" dateTime={recordedAt.toISOString()}>
            {t(attempt ? "recordedAt" : "storedCheckAt", { date: label(recordedAt) })}
          </time>
        </Tooltip>
      ) : (
        <span>{t("recordedTimeUnknown")}</span>
      )}
      {observedAt ? (
        <Tooltip
          content={t("observedAt", {
            date: format.dateTime(observedAt, { dateStyle: "full", timeStyle: "long" }),
          })}
        >
          <time className="block truncate" dateTime={observedAt.toISOString()}>
            {t("observedAt", { date: label(observedAt) })}
          </time>
        </Tooltip>
      ) : !view.isGroup ? (
        <span className="block truncate">{t("observedTimeUnknown")}</span>
      ) : null}
      {view.isGroup ? (
        <span className="block truncate">{t(`freshness.${view.freshness}`)}</span>
      ) : null}
    </div>
  );
}
