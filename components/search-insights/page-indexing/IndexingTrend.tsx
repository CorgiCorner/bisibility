"use client";

import { ExpandableCard } from "@/components/ui/ExpandableCard";
import type { IndexingDay } from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pausedRanges, trendDays, trendTicks, trendValueTicks } from "./history-presentation";
import { IndexingPath } from "./IndexingTable";
import { TrendColumn, TrendStopMark } from "./IndexingTrendMarks";
import { useIndexingDate } from "./use-indexing-date";

const axis = {
  fill: "var(--fg-muted)",
  fontSize: 11,
  fontFamily: "var(--font-sans), system-ui, sans-serif",
};
const series = [
  { key: "indexed", group: "indexed", color: "var(--green)" },
  { key: "notIndexed", group: "not_indexed", color: "var(--yellow)" },
] as const;

export function IndexingTrendTooltip({
  day,
  showYear = false,
}: Readonly<{ day: IndexingDay; showYear?: boolean }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const date = useIndexingDate();
  return (
    <div className="rounded-md border border-border bg-bg-elev p-2.5 text-ui-caption text-fg">
      <p className="m-0 mb-2 font-semibold">{date(day.date, showYear)}</p>
      <dl className="m-0 grid gap-1">
        {series.map((item) => (
          <div key={item.key} className="flex justify-between gap-4">
            <dt>{t(`groups.${item.group}`)}</dt>
            <dd className="m-0 tabular-nums">{format.number(day[item.key])}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-0 border-t border-border pt-1">
        {t("trendChecked", { checked: day.checked, total: day.total })}
      </p>
      <p className="mb-0">{t("inspectedThatDay", { count: day.inspectedThatDay })}</p>
      {day.changes.count ? (
        <div className="mt-2 max-w-80 border-t border-border pt-1">
          <p className="m-0 font-semibold">
            {t("changes")}: {format.number(day.changes.count)}
          </p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {day.changes.entries.slice(0, 5).map((change, index) => (
              <li key={`${change.url}:${index}`}>
                <IndexingPath value={change.url} />
                <span>{t("changeTransition", change)}</span>
              </li>
            ))}
          </ul>
          {day.changes.count > 5 ? (
            <p className="mb-0">
              {t("andMore", { count: day.changes.count - Math.min(5, day.changes.entries.length) })}
            </p>
          ) : null}
        </div>
      ) : null}
      {day.stop ? <p className="mb-0">{t(`stops.${day.stop}`)}</p> : null}
    </div>
  );
}

export function IndexingTrend({
  days = [],
  complete = true,
}: Readonly<{ days?: readonly IndexingDay[]; complete?: boolean }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const date = useIndexingDate();
  const plotted = trendDays(days);
  const latest = days.at(-1);
  const showYear = days[0]?.date.slice(0, 4) !== latest?.date.slice(0, 4);
  const valueTicks = trendValueTicks(
    Math.max(0, ...plotted.map((day) => day.plottedIndexed + day.plottedNotIndexed)),
  );
  const pauses = pausedRanges(plotted);
  return (
    <ExpandableCard title={t("trendTitle")} caption={t("trendCaption")} expandable={false}>
      <div className="min-w-0 px-4 pb-3">
        {!latest ? (
          <p className="text-ui-caption text-fg-muted">{t("trendEmpty")}</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-ui-caption text-fg">
              {series.map((item) => (
                <span key={item.key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-sm"
                    style={{ background: item.color }}
                  />
                  {t(`groups.${item.group}`)}{" "}
                  <strong className="tabular-nums">{format.number(latest[item.key])}</strong>
                </span>
              ))}
              {plotted.some((day) => day.changes.count) ? (
                <span className="flex items-center gap-1.5">
                  <svg aria-hidden width={8} height={8} viewBox="0 0 8 8">
                    <path d="M4,0l4,4l-4,4l-4,-4Z" fill="var(--fg-muted)" />
                  </svg>
                  {t("changes")}
                </span>
              ) : null}
              {plotted.some((day) => day.stop === "quota") ? (
                <span className="flex items-center gap-1.5">
                  <svg aria-hidden width={8} height={8} viewBox="0 0 8 8">
                    <path d="M0,3h8v2H0Z" fill="var(--fg-muted)" />
                  </svg>
                  {t("stops.quota")}
                </span>
              ) : null}
            </div>
            <ResponsiveContainer
              width="100%"
              height={220}
              minWidth={0}
              initialDimension={{ width: 600, height: 220 }}
            >
              <BarChart
                accessibilityLayer
                data={plotted}
                barCategoryGap="12%"
                maxBarSize={60}
                margin={{ top: 16, right: 20, bottom: 8, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={axis}
                  ticks={trendTicks(plotted)}
                  interval="preserveStartEnd"
                  tickFormatter={(key) => date(String(key), showYear)}
                  height={32}
                  tickMargin={10}
                />
                <YAxis
                  tickMargin={10}
                  axisLine={false}
                  tickLine={false}
                  tick={axis}
                  width={42}
                  allowDecimals={false}
                  ticks={valueTicks}
                  domain={[0, valueTicks.at(-1) ?? 1]}
                  tickFormatter={(value) => format.number(value)}
                />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ fill: "var(--bg-inset)", fillOpacity: 0.5 }}
                  content={(props) => {
                    const day =
                      props.activeIndex == null ? undefined : plotted[Number(props.activeIndex)];
                    return props.active && day ? (
                      <IndexingTrendTooltip day={day} showYear={showYear} />
                    ) : null;
                  }}
                />
                <Bar
                  dataKey="plottedIndexed"
                  stackId="checked"
                  fill="var(--green)"
                  isAnimationActive={false}
                  background={(props) => <TrendStopMark {...props} />}
                  shape={(props) => <TrendColumn {...props} top={false} />}
                />
                <Bar
                  dataKey="plottedNotIndexed"
                  stackId="checked"
                  fill="var(--yellow)"
                  isAnimationActive={false}
                  shape={(props) => <TrendColumn {...props} top />}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="m-0 text-ui-caption text-fg-muted">
              {t("historySince", { date: date(days[0].date, showYear) })}
            </p>
            {pauses.map((range) => (
              <p key={range.start} className="mb-0 text-ui-caption text-fg-muted">
                {t("pausedRange", {
                  dates:
                    range.start === range.end
                      ? date(range.start, showYear)
                      : `${date(range.start, showYear)} - ${date(range.end, showYear)}`,
                })}
              </p>
            ))}
            {!complete ? (
              <p className="mb-0 text-ui-caption text-fg-muted">
                {t("stillChecking", {
                  remaining: latest.total - latest.checked,
                  total: latest.total,
                })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </ExpandableCard>
  );
}
