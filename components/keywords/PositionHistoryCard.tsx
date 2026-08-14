"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card, ChartRegion, SectionTitle, SegmentedControl, ZonedTime } from "@/components/ui";
import type { KeywordDetailChartState } from "@/lib/keyword-detail/state-model";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import {
  comparisonAriaLabel,
  comparisonTargets,
  keywordMarketLabel,
  marketComparisonData,
} from "@/lib/keywords/market-position-history";
import { dailyPositionPoints, positionHistoryAriaLabel } from "@/lib/keywords/position-history";
import type { KeywordRow } from "@/lib/queries/keywords";
import { chartColors } from "@/lib/theme/chart-colors";
import { LineChart } from "@mui/x-charts/LineChart";
import type { ReactNode } from "react";
import { useState } from "react";
import { DegradedPositionMarkers } from "./DegradedPositionMarkers";
import { LatestPositionAnnotation, TargetReferenceLine } from "./PositionHistoryAnnotations";
import { marketPositionPalette, PositionHistoryMarketLegend } from "./PositionHistoryMarketLegend";

export { historyAnnotationTop } from "./PositionHistoryAnnotations";

type PositionHistoryCardProps = {
  chartState?: KeywordDetailChartState;
  keyword: KeywordRow;
  marketTargets?: readonly KeywordRow[];
  timeZone: string;
};

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
};

export function PositionHistoryCard({
  chartState,
  keyword,
  marketTargets = [keyword],
  timeZone,
}: Readonly<PositionHistoryCardProps>) {
  const [range, setRange] = useState<RangeLabel>("30d");
  const [scope, setScope] = useState<"all" | "single">("single");
  const { readOnly } = useProjectWriteMode();
  const activeRange = RANGES.find((option) => option.label === range) ?? RANGES[1];
  const history = dailyPositionPoints(keyword.positionHistory, activeRange.days);
  const markets = comparisonTargets(marketTargets, keyword);
  const visibleMarkets = markets.slice(0, 6);
  const showComparison = markets.length > 1;
  const allMarkets = showComparison && scope === "all";
  const comparison = marketComparisonData(visibleMarkets, activeRange.days);
  const boundaryVisible =
    history.length > 0 &&
    Boolean(
      keyword.positionHistoryBoundaryAt &&
        dailyPositionPoints([{ checkedAt: keyword.positionHistoryBoundaryAt }], activeRange.days)
          .length,
    );
  const labels = history.map((point) => point.label);
  const positions = history.map((point) => point.position);
  const target = keyword.targetPosition ?? null;
  const comparisonPositions = comparison.values.flatMap((series) =>
    series.data.flatMap((position) => (position === null ? [] : [position])),
  );
  const maxPosition = Math.max(20, ...(allMarkets ? comparisonPositions : positions), target ?? 1);
  const rangeEmpty = positions.length === 0;
  const notEnough = chartState === "one_check" || (!chartState && positions.length < 2);
  const chartLabels = allMarkets ? comparison.labels : notEnough ? [] : labels;
  const chartPositions = notEnough ? [] : positions;
  const chartSeries = allMarkets
    ? comparison.values.map((series, index) => ({
        color: marketPositionPalette[index % marketPositionPalette.length],
        curve: "linear" as const,
        data: series.data,
        label: keywordMarketLabel(series.target),
        showMark: false,
      }))
    : [
        {
          area: true,
          baseline: maxPosition,
          color: chartColors.accent,
          curve: "linear" as const,
          data: chartPositions,
          label: "Position",
          showMark: false,
        },
      ];
  const latestPosition = keyword.positionHistory.at(-1)?.position ?? null;
  const displayedPosition = positions.at(-1) ?? latestPosition;
  const latestCheckedAt = keyword.positionHistory.at(-1)?.checkedAt;
  const historyDateFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone,
  });
  const latestChip =
    latestPosition !== null && latestPosition > 0
      ? `Latest #${latestPosition} · ${latestCheckedAt ? historyDateFormatter.format(new Date(latestCheckedAt)) : "Today"}`
      : "Latest unavailable";
  const effectiveSchedule = resolveEffectiveSchedule(keyword.schedule);
  const nextCheckLabel: ReactNode = readOnly ? (
    "Paused - migration hold"
  ) : effectiveSchedule.frequency === "paused" ? (
    "Paused"
  ) : !effectiveSchedule.nextCheckAt ? (
    "Not scheduled"
  ) : (
    <ZonedTime timeZone={timeZone} value={effectiveSchedule.nextCheckAt.toISOString()} />
  );

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Position history</SectionTitle>
          <p className="m-0 mt-0.5 text-[12px] text-fg-muted">
            Google rank over time, closer to #1 is better
          </p>
          {boundaryVisible ? (
            <p className="mt-1 text-[11px] text-fg-muted">
              Comparison restarted after a ranking normalization change.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showComparison ? (
            <SegmentedControl
              activeVariant="accent"
              ariaLabel="Position history scope"
              fitContent
              onChange={setScope}
              options={[
                { label: "This market", value: "single" },
                { label: "All markets", value: "all" },
              ]}
              size="xs"
              value={scope}
            />
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-3 py-1 font-mono text-[11px] text-fg-muted">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent-solid" />
            {allMarkets ? `${markets.length} markets` : latestChip}
          </span>
          <div
            aria-label="Position history range"
            className="flex items-center gap-0.5 rounded-[9px] border border-border-strong bg-bg-elev p-0.5"
            role="tablist"
          >
            {RANGES.map((option) => (
              <button
                aria-selected={option.label === range}
                className={[
                  "rounded-[7px] px-3 py-1.5 font-mono text-[11.5px] outline-none transition-colors focus-visible:outline-none",
                  option.label === range
                    ? "bg-accent-solid text-accent-on-solid"
                    : "text-fg-muted hover:text-fg",
                ].join(" ")}
                key={option.label}
                onClick={() => setRange(option.label)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ChartRegion
        className="relative mt-3 h-[280px]"
        label={
          allMarkets
            ? comparisonAriaLabel(visibleMarkets)
            : positionHistoryAriaLabel(keyword.keyword, positions.at(-1), target)
        }
      >
        <LineChart
          grid={{ horizontal: true }}
          height={280}
          hideLegend
          margin={{ top: 18, right: 18, bottom: 28, left: 42 }}
          series={chartSeries}
          skipAnimation
          sx={{
            "& .MuiAreaElement-root": { fill: "var(--accent)", fillOpacity: 0.1 },
            "& .MuiChartsGrid-line": { stroke: "var(--border)" },
            "& .MuiChartsAxis-tickLabel": axisTextStyle,
            "& .MuiLineElement-root": {
              ...(allMarkets ? {} : { stroke: "var(--accent)" }),
              strokeLinecap: "round",
              strokeLinejoin: "round",
              strokeWidth: 2.8,
            },
          }}
          xAxis={[
            {
              data: chartLabels,
              disableLine: true,
              disableTicks: true,
              scaleType: "point",
              tickLabelStyle: axisTextStyle,
            },
          ]}
          yAxis={[
            {
              disableLine: true,
              disableTicks: true,
              domainLimit: "strict",
              max: maxPosition,
              min: 1,
              reverse: true,
              tickInterval: [1, 10, 20],
              tickLabelStyle: axisTextStyle,
              valueFormatter: (value: number) => `#${value}`,
            },
          ]}
        >
          {!allMarkets && target !== null && !rangeEmpty && !notEnough ? (
            <TargetReferenceLine target={target} />
          ) : null}
          {!allMarkets && target !== null && !rangeEmpty && !notEnough ? (
            <LatestPositionAnnotation labels={labels} positions={positions} target={target} />
          ) : null}
          {allMarkets ? (
            comparison.values.map((series, index) => (
              <DegradedPositionMarkers
                color={
                  marketPositionPalette[index % marketPositionPalette.length] ?? chartColors.accent
                }
                key={series.target.id}
                location={series.target.location}
                points={series.points}
              />
            ))
          ) : (
            <DegradedPositionMarkers
              color={chartColors.accent}
              location={keyword.location}
              points={history}
            />
          )}
        </LineChart>
        {!allMarkets && notEnough && !rangeEmpty ? (
          <>
            <span
              aria-label="Single rank check point"
              className="absolute left-[12.33%] top-[36.8%] z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg-elev"
            />
            <span
              aria-hidden
              className="absolute left-[12.33%] top-[36.8%] z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-solid"
            />
          </>
        ) : null}
        {!allMarkets && notEnough ? (
          <div
            className="absolute inset-0 grid place-items-center rounded-[12px]"
            style={{ background: "color-mix(in srgb, var(--bg-elev) 72%, transparent)" }}
          >
            <div className="flex flex-col items-center gap-2 rounded-[12px] border border-border-strong bg-bg-elev px-5 py-4 text-center">
              <p className="m-0 text-[13px] font-semibold text-fg">
                {rangeEmpty
                  ? `No checks in the last ${activeRange.days} days.`
                  : "Not enough history to chart yet."}
              </p>
              {displayedPosition !== null ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-bg-sunken px-3 py-1 font-mono text-[11px] text-fg-muted">
                  {rangeEmpty ? "Latest" : "Current"} #{displayedPosition} | Next check{" "}
                  {nextCheckLabel}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </ChartRegion>
      <PositionHistoryMarketLegend
        allMarkets={allMarkets}
        comparisonPoints={comparison.values.map((series) => series.points)}
        history={history}
        markets={markets}
        visibleMarkets={visibleMarkets}
      />
    </Card>
  );
}
