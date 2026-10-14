"use client";

import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { HistoryTime } from "./HistoryTime";
import type { AttemptHistoryPage } from "./history-contract";

export function AttemptHistoryTable({
  page,
  timeZone,
}: Readonly<{ page: AttemptHistoryPage; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  return (
    <div className="max-h-[480px] overflow-auto">
      <ReadOnlyDataTable
        id="history-attempts"
        label={t("attemptsTable")}
        headers={[
          t("columns.check"),
          t("columns.recorded"),
          t("columns.started"),
          t("columns.finished"),
          t("columns.execution"),
          t("columns.provider"),
          t("columns.reportedAttempts"),
        ]}
        rows={page.records.map((attempt) => {
          return {
            id: attempt.id,
            cells: [
              attempt.id,
              <HistoryTime key="historytime-0" value={attempt.recordedAt} timeZone={timeZone} />,
              <HistoryTime key="historytime-1" value={attempt.startedAt} timeZone={timeZone} />,
              <HistoryTime key="historytime-2" value={attempt.finishedAt} timeZone={timeZone} />,
              <Fragment key="details-0">
                <span>
                  {attempt.status === "failed"
                    ? t("execution.failed")
                    : attempt.status === "running"
                      ? t("execution.running")
                      : attempt.status === "completed"
                        ? t("execution.completed")
                        : attempt.status === "deferred"
                          ? t("execution.deferred")
                          : t("unknown")}
                </span>
                {attempt.errorCode ? (
                  <span className="block text-fg-muted">{attempt.errorCode}</span>
                ) : null}
                {attempt.deferredReason ? (
                  <span className="block text-fg-muted">{attempt.deferredReason}</span>
                ) : null}
              </Fragment>,
              attempt.provider ?? t("unknown"),
              attempt.reportedProviderAttemptCount,
            ],
          };
        })}
      />
      <p className="m-0 border-t border-border px-4 py-3 text-[11px] text-fg-muted">
        {t("attemptCountMeaning")}
      </p>
    </div>
  );
}
