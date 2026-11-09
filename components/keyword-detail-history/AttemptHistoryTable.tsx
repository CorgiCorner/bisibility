"use client";

import { DeferralReasonLabel } from "@/components/rank-runs/deferral-reason-copy";
import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { HistoryDetails } from "./HistoryDetails";
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
        emptyState={
          <EmptyState compact title={t("noAttempts")} description={t("noRecordsDescription")} />
        }
        headers={[
          t("columns.recorded"),
          t("columns.execution"),
          t("columns.provider"),
          t("columns.reportedAttempts"),
          t("detailToggle"),
        ]}
        rows={page.records.map((attempt) => {
          const cells = [
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
                <span className="block text-fg-muted">
                  {attempt.errorCode === "organic_depth_not_covered"
                    ? t("organicDepthNotCovered")
                    : attempt.errorCode}
                </span>
              ) : null}
              {attempt.deferredReason ? (
                <DeferralReasonLabel reason={attempt.deferredReason} />
              ) : null}
            </Fragment>,
            attempt.provider ?? t("unknown"),
            attempt.reportedProviderAttemptCount,
          ];
          return {
            id: attempt.id,
            cells: [
              cells[1],
              cells[4],
              cells[5],
              cells[6],
              <HistoryDetails key="attempt-details">
                <div className="mt-2 space-y-1 text-fg-muted">
                  <div>{attempt.id}</div>
                  <div>
                    {t("columns.started")}: {cells[2]}
                  </div>
                  <div>
                    {t("columns.finished")}: {cells[3]}
                  </div>
                </div>
              </HistoryDetails>,
            ],
          };
        })}
      />
      <div className="flex items-center gap-1 border-t border-border px-4 py-3 text-[11px] text-fg-muted">
        <span>{t("attempts")}</span>
        <InfoTooltip text={t("attemptCountMeaning")} />
      </div>
    </div>
  );
}
