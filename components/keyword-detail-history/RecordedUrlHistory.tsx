"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { useFormatter, useTranslations } from "next-intl";
import { HistoryTime, historyExternalUrl } from "./HistoryTime";
import type { ObservationHistoryPage } from "./history-contract";

export function RecordedUrlHistory({
  page,
  timeZone,
}: Readonly<{ page: ObservationHistoryPage; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  return (
    <Card className="overflow-visible rounded-card p-0" size="lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <SectionTitle>{t("urlHistoryTitle")}</SectionTitle>
          <p className="m-0 mt-1 text-xs text-fg-muted">{t("urlHistoryMeaning")}</p>
        </div>
        <LocalizedMeasurementHelp metricId="ranking_url" definitionVersion="help-v1" />
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[11.5px]">
          <caption className="sr-only">{t("urlsTable")}</caption>
          <thead className="sticky top-0 z-10 bg-bg-elev">
            <tr>
              {(["check", "observed", "recorded", "expected", "ranking"] as const).map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={`${tableHeaderClassName} px-5 py-3 font-semibold`}
                >
                  {t(`columns.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.records.map((record) => {
              const url = historyExternalUrl(record.rankingUrl);
              return (
                <tr key={record.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-5 py-3 font-normal">
                    {record.id}
                  </th>
                  <td className="px-5 py-3">
                    <HistoryTime value={record.observedAt} timeZone={timeZone} />
                  </td>
                  <td className="px-5 py-3">
                    <HistoryTime value={record.recordedAt} timeZone={timeZone} />
                  </td>
                  <td className="max-w-[260px] break-all px-5 py-3">
                    {record.expectedUrlAtCheck ?? t("unknown")}
                  </td>
                  <td className="max-w-[260px] break-all px-5 py-3">
                    {url ? (
                      <a
                        className="underline underline-offset-4"
                        href={url}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {record.rankingUrl}
                      </a>
                    ) : (
                      (record.rankingUrl ?? t("unknown"))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 border-t border-border px-5 py-3 text-[11px] text-fg-muted">
        {t("loadedCount", {
          loaded: format.number(page.records.length),
          total: format.number(page.totalCount),
        })}
      </p>
    </Card>
  );
}
