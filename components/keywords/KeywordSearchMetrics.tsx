"use client";

import { keywordMarketLabel } from "@/lib/keywords/market-position-history";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useFormatter, useTranslations } from "next-intl";
import { keywordMetricsAvailability } from "./keyword-header-model";

export function KeywordSearchMetrics({ keyword }: Readonly<{ keyword: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordDetail");
  const format = useFormatter();
  const unavailable = keywordMetricsAvailability(keyword);
  const note =
    unavailable?.kind === "unsupported"
      ? t("header.metricsUnsupported")
      : unavailable?.kind === "missing"
        ? t("header.metricsUnavailable", {
            count: unavailable.metrics.length,
            metrics: unavailable.metrics
              .map((metric) =>
                metric === "volume" ? t("header.searchVolume") : t("header.difficultyMetric"),
              )
              .join(t("header.metricListSeparator")),
          })
        : null;
  const allMissing =
    keyword.volumeKnown === false &&
    keyword.difficultyKnown === false &&
    keyword.cpcKnown === false;
  const metrics = [
    {
      label: t("header.volume"),
      value:
        keyword.volumeKnown === false
          ? t("common.notAvailable")
          : t("header.volumePerMonth", { value: format.number(keyword.volume) }),
    },
    {
      label: t("header.difficulty"),
      value:
        keyword.difficultyKnown === false
          ? t("common.notAvailable")
          : format.number(keyword.difficulty),
    },
    {
      label: t("header.cpc"),
      value:
        keyword.cpcKnown === false
          ? t("common.notAvailable")
          : format.number(Number(keyword.cpc), {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 4,
            }),
    },
  ];
  return (
    <section
      aria-label={t("header.searchMetrics")}
      className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-fg-muted"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <span className="font-medium">{t("header.searchMetrics")}</span>
        {!allMissing ? (
          <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1">
            {metrics.map((metric) => (
              <div className="flex items-baseline gap-2" key={metric.label}>
                <dt>{metric.label}</dt>
                <dd className="m-0 font-semibold tabular-nums text-fg">{metric.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {allMissing ? (
          <span>{note}</span>
        ) : (
          <span>{t("header.metricsForMarket", { market: keywordMarketLabel(keyword) })}</span>
        )}
      </div>
      {!allMissing && note ? <p className="m-0 mt-1">{note}</p> : null}
    </section>
  );
}
