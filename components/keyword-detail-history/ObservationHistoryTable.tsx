"use client";

import { Button } from "@/components/ui/Button";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { useFormatter, useTranslations } from "next-intl";
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
      <table className="w-full min-w-[1100px] border-collapse text-left text-[11.5px]">
        <caption className="sr-only">{t("observationsTable")}</caption>
        <thead className="sticky top-0 z-10 bg-bg-elev">
          <tr>
            {(
              [
                "observed",
                "recorded",
                "position",
                "quality",
                "capturedScope",
                "kernelMovement",
                "recordedUrls",
                "check",
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
          {page.records.map((observation) => {
            const pair = observationKernelMovement(page, observation);
            const url = historyExternalUrl(observation.rankingUrl);
            return (
              <tr key={observation.id} className="border-b border-border align-top last:border-b-0">
                <td className="px-4 py-3">
                  <HistoryTime value={observation.observedAt} timeZone={timeZone} />
                </td>
                <td className="px-4 py-3">
                  <HistoryTime value={observation.recordedAt} timeZone={timeZone} />
                </td>
                <td className="px-4 py-3 font-sans tabular-nums">
                  <HistoryPosition observation={observation} />
                </td>
                <td className="px-4 py-3 text-fg-muted">
                  <span>{t(`freshness.${observation.freshness}`)}</span>
                  <span className="block">
                    {t("methodology", {
                      version: observation.normalizationVersion ?? t("unknown"),
                    })}
                  </span>
                  <span className="block">
                    {t("coverage", { value: t(`coverageState.${observation.completeness}`) })}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <HistoryScope scope={observation.configuredScope} />
                  <span className="mt-1 block text-fg-muted">{t("effectiveScope")}</span>
                  <HistoryScope scope={observation.effectiveScope} />
                </td>
                <td className="px-4 py-3">
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
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <span className="block break-all">
                    {t("expectedUrl", { value: observation.expectedUrlAtCheck ?? t("unknown") })}
                  </span>
                  {url ? (
                    <a
                      className="mt-1 block break-all text-fg underline underline-offset-4"
                      href={url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {observation.rankingUrl}
                    </a>
                  ) : (
                    <span>
                      {t("rankingUrl", { value: observation.rankingUrl ?? t("unknown") })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpen(observation.id)}
                    aria-label={t("openObservation", { id: observation.id })}
                  >
                    {t("openSnapshot")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
