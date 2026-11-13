"use client";

import { ChartMarkerLegend } from "@/components/charts/ChartMarkerLegend";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import type { DailyClickPoint } from "@/lib/search-insights/queries/daily-clicks-model";
import { dailyClicksAreEmpty } from "@/lib/search-insights/queries/daily-clicks-model";
import { useFormatter, useTranslations } from "next-intl";

export type SearchInsightsClicksChartProps = {
  markers?: readonly ChartMarker[];
  points: readonly DailyClickPoint[];
  projectId: string;
};

export function SearchInsightsClicksChartLoading() {
  const t = useTranslations("projectSearchInsights.copy");
  return <Card aria-label={t("clicksPerDayLoading")} className="h-64 animate-pulse bg-bg-sunken" />;
}

export function SearchInsightsClicksChart({
  markers = [],
  points,
  projectId,
}: Readonly<SearchInsightsClicksChartProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const format = useFormatter();
  const empty = dailyClicksAreEmpty(points);
  const dateKeys = points.map((point) => point.dateKey);
  const seriesLabel = t("clicksSeries");

  return (
    <Card className="flex min-w-0 flex-col px-5 py-4.5" size="md">
      <SectionTitle>{t("clicksPerDay")}</SectionTitle>
      {empty ? (
        <div className="mt-3 px-1 py-8 text-center">
          <p className="m-0 text-ui-body text-fg">{t("clicksPerDayEmptyTitle")}</p>
          <p className="m-0 mt-1 text-ui-caption text-fg-muted">
            {t("clicksPerDayEmptyDescription")}
          </p>
        </div>
      ) : (
        <ChartRegion className="relative mt-3 h-64" label={t("clicksPerDayChartAria")}>
          <TimeSeriesChart
            dateKeys={dateKeys}
            height={256}
            labels={dateKeys}
            margin={{ top: 12, right: 16, bottom: 0, left: 8 }}
            markerProjectRef={projectId}
            markers={markers}
            min={0}
            renderTooltip={(index) => {
              const point = points[index];
              if (!point || point.clicks === null) return null;
              return (
                <p className="m-0 font-sans tabular-nums">
                  {seriesLabel} {format.number(point.clicks)}
                </p>
              );
            }}
            series={[
              {
                color: "var(--accent)",
                dots: true,
                fill: true,
                label: seriesLabel,
                values: points.map((point) => point.clicks),
              },
            ]}
            xTickIndexes={[0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
              (index, position, indexes) => index >= 0 && indexes.indexOf(index) === position,
            )}
          />
        </ChartRegion>
      )}
      {markers.length > 0 && !empty ? (
        <ChartMarkerLegend markers={markers} projectRef={projectId} />
      ) : null}
    </Card>
  );
}
