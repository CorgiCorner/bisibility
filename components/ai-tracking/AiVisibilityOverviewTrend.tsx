"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OverviewDay } from "@/lib/ai-tracking/overview-model";
import { formatDisplayDateRange } from "@/lib/dates/format";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

/** Evenly thinned category ticks, always keeping the first and last day. */
export function visibilityTrendTicks(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const step = Math.max(1, Math.round((count - 1) / 4));
  const indexes = [0];
  for (let index = step; index < count - 1; index += step) indexes.push(index);
  indexes.push(count - 1);
  return indexes;
}

export function AiVisibilityOverviewTrend({
  days,
  schedulesHref,
}: Readonly<{ days: readonly OverviewDay[]; schedulesHref: string }>) {
  const t = useTranslations("projectAiTracking");
  const format = useFormatter();
  const dates = useDateDisplay();
  const percent = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, style: "percent" });
  const labels = days.map((day) => formatDisplayDateRange(day.day, day.day, dates));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 font-sans text-ui-section">{t("overview.trendTitle")}</h2>
      {days.length >= 2 ? (
        <>
          <ul
            aria-label={t("overview.trendLegend")}
            className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0"
          >
            <li className="inline-flex items-center gap-1.5 text-ui-caption text-fg-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
              {t("overview.seriesMentioned")}
            </li>
            <li className="inline-flex items-center gap-1.5 text-ui-caption text-fg-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-green" />
              {t("overview.seriesCited")}
            </li>
          </ul>
          <TimeSeriesChart
            formatValue={percent}
            height={220}
            labels={labels}
            margin={{ top: 12, right: 16, bottom: 0, left: 8 }}
            max={1}
            min={0}
            series={[
              {
                color: "var(--accent)",
                formatValue: percent,
                label: t("overview.seriesMentioned"),
                values: days.map((day) => day.mentionedShare),
              },
              {
                color: "var(--green)",
                formatValue: percent,
                label: t("overview.seriesCited"),
                values: days.map((day) => day.citedShare),
              },
            ]}
            xTickIndexes={visibilityTrendTicks(days.length)}
            yWidth={56}
          />
        </>
      ) : (
        <EmptyState
          action={
            <Button component={Link} href={schedulesHref} size="sm" variant="secondary">
              {t("overview.runDaily")}
            </Button>
          }
          compact
          title={t("overview.trendEmpty")}
        />
      )}
    </section>
  );
}
