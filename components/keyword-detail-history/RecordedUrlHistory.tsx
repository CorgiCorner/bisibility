"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
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
        <ReadOnlyDataTable
          id="history-urls"
          label={t("urlsTable")}
          headers={[
            t("columns.check"),
            t("columns.observed"),
            t("columns.recorded"),
            t("columns.expected"),
            t("columns.ranking"),
          ]}
          rows={page.records.map((record) => {
            const url = historyExternalUrl(record.rankingUrl);
            return {
              id: record.id,
              cells: [
                record.id,
                <HistoryTime key="historytime-0" value={record.observedAt} timeZone={timeZone} />,
                <HistoryTime key="historytime-1" value={record.recordedAt} timeZone={timeZone} />,
                record.expectedUrlAtCheck ?? t("unknown"),
                url ? (
                  <a
                    key="a-0"
                    className="underline underline-offset-4"
                    href={url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {record.rankingUrl}
                  </a>
                ) : (
                  (record.rankingUrl ?? t("unknown"))
                ),
              ],
            };
          })}
        />
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
