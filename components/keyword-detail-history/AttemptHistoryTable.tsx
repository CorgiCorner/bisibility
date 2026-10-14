"use client";

import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { useTranslations } from "next-intl";
import { HistoryTime } from "./HistoryTime";
import type { AttemptHistoryPage } from "./history-contract";

export function AttemptHistoryTable({
  page,
  timeZone,
}: Readonly<{ page: AttemptHistoryPage; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  return (
    <div className="max-h-[480px] overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
        <caption className="sr-only">{t("attemptsTable")}</caption>
        <thead className="sticky top-0 z-10 bg-bg-elev">
          <tr>
            {(
              [
                "check",
                "recorded",
                "started",
                "finished",
                "execution",
                "provider",
                "reportedAttempts",
              ] as const
            ).map((key) => (
              <th
                key={key}
                scope="col"
                className={`${tableHeaderClassName} px-4 py-3 font-semibold`}
              >
                {t(`columns.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.records.map((attempt) => (
            <tr key={attempt.id} className="border-b border-border align-top last:border-b-0">
              <th scope="row" className="px-4 py-3 font-normal">
                {attempt.id}
              </th>
              <td className="px-4 py-3">
                <HistoryTime value={attempt.recordedAt} timeZone={timeZone} />
              </td>
              <td className="px-4 py-3">
                <HistoryTime value={attempt.startedAt} timeZone={timeZone} />
              </td>
              <td className="px-4 py-3">
                <HistoryTime value={attempt.finishedAt} timeZone={timeZone} />
              </td>
              <td className="px-4 py-3">
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
              </td>
              <td className="px-4 py-3">{attempt.provider ?? t("unknown")}</td>
              <td className="px-4 py-3 font-sans tabular-nums">
                {attempt.reportedProviderAttemptCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 border-t border-border px-4 py-3 text-[11px] text-fg-muted">
        {t("attemptCountMeaning")}
      </p>
    </div>
  );
}
