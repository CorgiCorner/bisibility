"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useFormatter, useTranslations } from "next-intl";
import { HistoryTime, historyExternalUrl } from "./HistoryTime";
import type { ObservationHistoryPage } from "./history-contract";
import { determinateHistoryAbsence } from "./no-match-presentation";
import { SectionChevron, useSectionDisclosure } from "./section-disclosure";

export function RecordedUrlHistory({
  page,
  timeZone,
  noMatchDepths = {},
}: Readonly<{
  page: ObservationHistoryPage;
  timeZone: string;
  noMatchDepths?: Readonly<Record<string, number>>;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { open, toggle } = useSectionDisclosure("ranking-pages");
  return (
    <Card className="overflow-visible rounded-card p-0" size="lg">
      <div className="flex items-center justify-between px-4 py-4 sm:px-5">
        <div>
          <div className="flex min-w-0 items-center gap-2">
            <SectionTitle>{t("urlHistoryTitle")}</SectionTitle>
            <LocalizedMeasurementHelp metricId="ranking_url" definitionVersion="help-v1" />
          </div>
          <p className="m-0 mt-1 text-xs text-fg-muted">{t("urlHistoryDescription")}</p>
        </div>
        <div className="flex items-center gap-4">
          <SectionChevron open={open} toggle={toggle} title={t("urlHistoryTitle")} />
        </div>
      </div>
      <div hidden={!open}>
        <div className="max-h-[480px] overflow-auto">
          <ReadOnlyDataTable
            id="history-urls"
            fillLastColumn
            label={t("urlsTable")}
            emptyState={
              <EmptyState
                compact
                title={t("noObservations")}
                description={t("noRecordsDescription")}
              />
            }
            headers={[t("columns.observed"), t("columns.expected"), t("columns.ranking")]}
            rows={page.records.map((record) => {
              const url = historyExternalUrl(record.rankingUrl);
              return {
                id: record.id,
                cells: [
                  <HistoryTime key="historytime-0" value={record.observedAt} timeZone={timeZone} />,
                  record.expectedUrlAtCheck ?? t("unknown"),
                  url ? (
                    <a
                      key="a-0"
                      className="block max-w-full break-all underline underline-offset-4"
                      title={record.rankingUrl ?? undefined}
                      href={url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {record.rankingUrl}
                    </a>
                  ) : (
                    (record.rankingUrl ??
                    (determinateHistoryAbsence(record, noMatchDepths[record.id])
                      ? t("noRankingUrl")
                      : t("unknown")))
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
      </div>
    </Card>
  );
}
