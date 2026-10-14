"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { useFormatter, useTranslations } from "next-intl";
import { HistoryPosition } from "./HistoryPosition";
import { HistoryResultKind } from "./HistoryResultKind";
import { HistoryScope } from "./HistoryScope";
import { HistoryTime, historyExternalUrl } from "./HistoryTime";
import type { RetainedHistorySnapshot } from "./history-contract";

export function RetainedSnapshotCard({
  snapshot,
  timeZone,
}: Readonly<{ snapshot: RetainedHistorySnapshot; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const observation = snapshot.observation;
  return (
    <Card
      className="overflow-visible rounded-card p-0"
      size="lg"
      data-testid="retained-history-snapshot"
    >
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center justify-between">
          <SectionTitle>{t("snapshotTitle", { id: observation.id })}</SectionTitle>
          <LocalizedMeasurementHelp metricId="organic_rank" definitionVersion="help-v1" />
        </div>
        <p className="m-0 mt-1 text-xs text-fg-muted">{t(`retention.${snapshot.detailState}`)}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <span className="font-sans tabular-nums font-semibold">
            <HistoryPosition observation={observation} />
          </span>
          <span>
            {t("observedLabel")} <HistoryTime value={observation.observedAt} timeZone={timeZone} />
          </span>
          <span>
            {t("recordedLabel")} <HistoryTime value={observation.recordedAt} timeZone={timeZone} />
          </span>
        </div>
        <p className="m-0 mt-2 break-all text-xs text-fg-muted">
          {t("expectedUrl", { value: observation.expectedUrlAtCheck ?? t("unknown") })}
        </p>
        <p className="m-0 mt-1 break-all text-xs text-fg-muted">
          {t("rankingUrl", { value: observation.rankingUrl ?? t("unknown") })}
        </p>
        <p className="m-0 mt-1 text-xs text-fg-muted">
          {t("depthMetadata", {
            requested:
              observation.requestedDepth === null
                ? t("unknown")
                : format.number(observation.requestedDepth),
            through:
              observation.completeThrough === null
                ? t("unknown")
                : format.number(observation.completeThrough),
          })}
        </p>
        <div className="mt-2">
          <HistoryScope scope={observation.configuredScope} />
        </div>
        <div className="mt-2">
          <span className="text-[11px] text-fg-muted">{t("effectiveScope")}</span>
          <HistoryScope scope={observation.effectiveScope} />
        </div>
      </div>
      <section className="border-b border-border px-5 py-4" aria-label={t("featuresTitle")}>
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[13px] font-semibold">{t("featuresTitle")}</h3>
          <LocalizedMeasurementHelp metricId="feature_presence" definitionVersion="help-v1" />
        </div>
        <p className="m-0 mt-1 text-xs text-fg-muted">{t("featureMeaning")}</p>
        {snapshot.featureFacts?.length ? (
          <ul className="m-0 mt-3 grid gap-2 p-0">
            {snapshot.featureFacts.map((fact, index) => (
              <li
                key={`${fact.feature}:${index}`}
                className="flex list-none flex-wrap gap-x-3 gap-y-1 text-xs"
              >
                <span>
                  <HistoryResultKind kind={fact.feature} />
                </span>
                <span>{t(`presence.${fact.presence}`)}</span>
                <span>{t(`ownership.${fact.ownership}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-3 text-xs text-fg-muted">{t("featureUnknown")}</p>
        )}
      </section>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
          <caption className="sr-only">{t("itemsTable")}</caption>
          <thead className="sticky top-0 z-10 bg-bg-elev">
            <tr>
              {(["kind", "absoluteRank", "groupRank", "domain", "result"] as const).map((key) => (
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
            {snapshot.items.map((item) => {
              const url = historyExternalUrl(item.url ?? item.mapsUrl);
              return (
                <tr key={item.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-5 py-3">
                    <HistoryResultKind kind={item.resultKind} />
                  </td>
                  <td className="px-5 py-3 font-sans tabular-nums">
                    {item.rankAbsolute ?? t("unknown")}
                  </td>
                  <td className="px-5 py-3 font-sans tabular-nums">
                    {item.rankGroup ?? t("unknown")}
                  </td>
                  <td className="px-5 py-3">{item.domain ?? t("unknown")}</td>
                  <td className="max-w-[360px] break-all px-5 py-3">
                    {url ? (
                      <a
                        className="underline underline-offset-4"
                        href={url}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {item.title ?? item.businessName ?? url}
                      </a>
                    ) : (
                      (item.title ?? item.businessName ?? t("unknown"))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {snapshot.items.length === 0 ? (
        <p className="m-0 px-5 py-4 text-xs text-fg-muted">{t("noRetainedItems")}</p>
      ) : null}
    </Card>
  );
}
