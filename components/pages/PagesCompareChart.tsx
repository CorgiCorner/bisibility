"use client";

import { ChartMarkerLegend } from "@/components/charts/ChartMarkerLegend";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import type { CompareResult } from "@/lib/pages/compare-model";
import { useTranslations } from "next-intl";
import { ReferenceLine } from "recharts";

export function PagesCompareChart({
  projectId,
  result,
}: Readonly<{ projectId: string; result: CompareResult }>) {
  const t = useTranslations("projectPages");
  const moment = result.points.findIndex((point) => point.day === result.moment);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-ui-caption text-fg-muted">{t("compare.chartLabel")}</p>
      <TimeSeriesChart
        dateKeys={result.points.map((point) => point.day)}
        height={280}
        labels={result.points.map((point) => point.day)}
        markerProjectRef={projectId}
        markers={result.markers}
        series={[
          {
            color: "var(--blue)",
            label: t("compare.seriesChanged"),
            values: result.points.map((point) => point.changed),
          },
          {
            color: "var(--fg-muted)",
            label: t("compare.seriesUnchanged"),
            values: result.points.map((point) => point.unchanged),
          },
        ]}
      >
        {moment >= 0 ? (
          <ReferenceLine stroke="var(--yellow)" strokeDasharray="3 3" x={moment} />
        ) : null}
      </TimeSeriesChart>
      <ChartMarkerLegend
        markers={result.markers}
        projectRef={projectId}
        series={
          <div className="flex shrink-0 flex-nowrap gap-3 text-ui-caption text-fg">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-blue" />
              {t("compare.seriesChanged")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-fg-muted" />
              {t("compare.seriesUnchanged")}
            </span>
          </div>
        }
      />
      <p className="m-0 text-ui-caption text-fg-muted">{t("compare.caveat")}</p>
    </div>
  );
}
