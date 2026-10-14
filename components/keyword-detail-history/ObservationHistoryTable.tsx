"use client";

import { Button } from "@/components/ui/Button";
import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment } from "react";
import { HistoryPosition } from "./HistoryPosition";
import { HistoryScope } from "./HistoryScope";
import { HistoryTime, historyExternalUrl } from "./HistoryTime";
import { observationKernelMovement } from "./history-chart-model";
import type { ObservationHistoryPage } from "./history-contract";

export function ObservationHistoryTable({
  page,
  onOpen,
  timeZone,
}: Readonly<{
  page: ObservationHistoryPage;
  onOpen: (checkId: string) => void;
  timeZone: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  return (
    <div className="max-h-[480px] overflow-auto">
      <ReadOnlyDataTable
        id="history-observations"
        label={t("observationsTable")}
        headers={[
          t("columns.observed"),
          t("columns.recorded"),
          t("columns.position"),
          t("columns.quality"),
          t("columns.capturedScope"),
          t("columns.kernelMovement"),
          t("columns.recordedUrls"),
          t("columns.check"),
        ]}
        rows={page.records.map((observation) => {
          const pair = observationKernelMovement(page, observation);
          const url = historyExternalUrl(observation.rankingUrl);
          return {
            id: observation.id,
            cells: [
              <HistoryTime
                key="historytime-0"
                value={observation.observedAt}
                timeZone={timeZone}
              />,
              <HistoryTime
                key="historytime-1"
                value={observation.recordedAt}
                timeZone={timeZone}
              />,
              <HistoryPosition key="historyposition-0" observation={observation} />,
              <Fragment key="details-0">
                <span>{t(`freshness.${observation.freshness}`)}</span>
                <span className="block">
                  {t("methodology", {
                    version: observation.normalizationVersion ?? t("unknown"),
                  })}
                </span>
                <span className="block">
                  {t("coverage", { value: t(`coverageState.${observation.completeness}`) })}
                </span>
              </Fragment>,
              <Fragment key="details-1">
                <HistoryScope key="historyscope-0" scope={observation.configuredScope} />
                <span className="mt-1 block text-fg-muted">{t("effectiveScope")}</span>
                <HistoryScope key="historyscope-1" scope={observation.effectiveScope} />
              </Fragment>,
              <Fragment key="details-2">
                {pair?.movement !== null && pair?.movement !== undefined
                  ? t("movement", { value: format.number(pair.movement) })
                  : pair?.event
                    ? t(`events.${pair.event}`)
                    : t("noPair")}
                {pair?.baseline ? (
                  <span className="mt-1 block text-fg-muted">
                    {t("baselineCheck", { id: pair.baseline.id })}
                  </span>
                ) : null}
              </Fragment>,
              <Fragment key="details-3">
                <span className="block break-all">
                  {t("expectedUrl", { value: observation.expectedUrlAtCheck ?? t("unknown") })}
                </span>
                {url ? (
                  <a
                    key="a-0"
                    className="mt-1 block break-all text-fg underline underline-offset-4"
                    href={url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {observation.rankingUrl}
                  </a>
                ) : (
                  <span>{t("rankingUrl", { value: observation.rankingUrl ?? t("unknown") })}</span>
                )}
              </Fragment>,
              <Button
                key="button-0"
                size="sm"
                variant="secondary"
                onClick={() => onOpen(observation.id)}
                aria-label={t("openObservation", { id: observation.id })}
              >
                {t("openSnapshot")}
              </Button>,
            ],
          };
        })}
      />
    </div>
  );
}
