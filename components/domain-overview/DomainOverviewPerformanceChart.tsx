"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { HistoricalOverviewRow } from "@/lib/providers/types";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  formatDomainEstimatedCost,
  type HistoryMetric,
  historyDateKey,
  historyMetricValue,
} from "./domain-overview-metrics";

type Range = "12m" | "3m" | "6m";

function formatValue(value: number, metric: HistoryMetric, locale: string) {
  if (metric === "value") {
    return new Intl.NumberFormat(locale, {
      currency: "USD",
      maximumFractionDigits: 0,
      notation: "compact",
      style: "currency",
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: value >= 1_000 ? "compact" : "standard",
  }).format(value);
}

export function DomainOverviewPerformanceChart({
  estimateCents,
  failed,
  history,
  loading,
  onLoad,
  readOnly = false,
}: Readonly<{
  estimateCents?: number | null;
  failed?: boolean;
  history: HistoricalOverviewRow[] | null;
  loading: boolean;
  onLoad?: () => void;
  readOnly?: boolean;
}>) {
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const [metric, setMetric] = useState<HistoryMetric>("traffic");
  const [range, setRange] = useState<Range>("12m");
  const months = range === "3m" ? 4 : range === "6m" ? 7 : 13;
  const visible = history?.slice(-months) ?? [];
  const values = visible.map((row) => historyMetricValue(row, metric));
  const dateKeys = visible.map(historyDateKey);
  const rangeOptions = [
    { label: t("range3m"), value: "3m" },
    { label: t("range6m"), value: "6m" },
    { label: t("range12m"), value: "12m" },
  ] as const;
  const metricOptions = [
    { label: t("metricTraffic"), value: "traffic" },
    { label: t("metricKeywords"), value: "keywords" },
    { label: t("metricTopTen"), value: "top10" },
    { label: t("metricValue"), value: "value" },
  ] as const;
  const metricLabels: Record<HistoryMetric, string> = {
    keywords: t("metricKeywords"),
    top10: t("metricTopTen"),
    traffic: t("metricTraffic"),
    value: t("metricValue"),
  };

  return (
    <Card className="flex min-h-[350px] min-w-0 flex-col px-4 py-4" size="md">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="mr-auto">
          <h3 className="m-0 text-[14.5px] font-semibold">{t("organicPerformance")}</h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">{t("monthlyIndexHistory")}</p>
        </div>
        <SegmentedControl
          ariaLabel={t("historyRange")}
          fitContent
          onChange={setRange}
          options={rangeOptions}
          size="xs"
          value={range}
        />
      </div>
      <div className="mt-3 flex min-w-0 items-center">
        <SegmentedControl
          ariaLabel={t("historyMetric")}
          fitContent
          onChange={setMetric}
          options={metricOptions}
          size="xs"
          value={metric}
        />
      </div>
      {visible.length > 1 ? (
        <ChartRegion
          className="mt-2 h-[260px]"
          label={t("monthlyPerformanceChart", { metric: metricLabels[metric] })}
        >
          <TimeSeriesChart
            height={260}
            dateKeys={dateKeys}
            dateLabelStyle="month_year"
            labels={dateKeys}
            series={[{ label: metricLabels[metric], values, color: "var(--accent)", fill: true }]}
            formatValue={(value) => formatValue(value, metric, dateDisplay.locale)}
            areaOpacity={0.09}
            strokeWidth={2.5}
            yWidth={48}
            xTickIndexes={dateKeys.flatMap((_, index) =>
              visible.length <= 7 || index % 2 === 0 || index === visible.length - 1 ? [index] : [],
            )}
            margin={{ top: 12, right: 34, bottom: 0, left: 0 }}
          />
        </ChartRegion>
      ) : (
        <div className="grid min-h-[260px] flex-1 place-items-center text-center">
          <div className="grid justify-items-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-control bg-bg-sunken text-fg-muted">
              <ChartLineUp aria-hidden size={22} weight="regular" />
            </span>
            <strong className="text-sm">
              {readOnly ? t("historyNotCollected") : t("loadMonthlyHistory")}
            </strong>
            <span className="max-w-[360px] font-sans tabular-nums text-[11px] leading-relaxed text-fg-muted">
              {failed
                ? t("historyLoadFailed")
                : readOnly
                  ? t("historySavedUnavailable")
                  : t("historyCacheHint")}
            </span>
            {!readOnly && onLoad ? (
              <Button loading={loading} onClick={onLoad} size="sm" variant="secondary">
                {t("loadHistory")}
                {estimateCents == null
                  ? null
                  : ` ${formatDomainEstimatedCost(estimateCents, dateDisplay.locale, t)}`}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
