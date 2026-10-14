"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { ReadOnlyDataTable } from "@/components/ui/data-table/ReadOnlyDataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
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
            <HistoryPosition key="historyposition-0" observation={observation} />
          </span>
          <span>
            {t("observedLabel")}{" "}
            <HistoryTime key="historytime-0" value={observation.observedAt} timeZone={timeZone} />
          </span>
          <span>
            {t("recordedLabel")}{" "}
            <HistoryTime key="historytime-1" value={observation.recordedAt} timeZone={timeZone} />
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
          <HistoryScope key="historyscope-0" scope={observation.configuredScope} />
        </div>
        <div className="mt-2">
          <span className="text-[11px] text-fg-muted">{t("effectiveScope")}</span>
          <HistoryScope key="historyscope-1" scope={observation.effectiveScope} />
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
                  <HistoryResultKind key="historyresultkind-0" kind={fact.feature} />
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
        <ReadOnlyDataTable
          id="history-snapshot-items"
          label={t("itemsTable")}
          headers={[
            t("columns.kind"),
            t("columns.absoluteRank"),
            t("columns.groupRank"),
            t("columns.domain"),
            t("columns.result"),
          ]}
          rows={snapshot.items.map((item) => {
            const url = historyExternalUrl(item.url ?? item.mapsUrl);
            return {
              id: item.id,
              cells: [
                <HistoryResultKind key="historyresultkind-1" kind={item.resultKind} />,
                item.rankAbsolute ?? t("unknown"),
                item.rankGroup ?? t("unknown"),
                item.domain ?? t("unknown"),
                url ? (
                  <a
                    key="a-0"
                    className="underline underline-offset-4"
                    href={url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {item.title ?? item.businessName ?? url}
                  </a>
                ) : (
                  (item.title ?? item.businessName ?? t("unknown"))
                ),
              ],
            };
          })}
        />
      </div>
      {snapshot.items.length === 0 ? (
        <p className="m-0 px-5 py-4 text-xs text-fg-muted">{t("noRetainedItems")}</p>
      ) : null}
    </Card>
  );
}
