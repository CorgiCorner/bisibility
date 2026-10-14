"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { KeywordHistoryPort } from "@/components/keyword-detail-history/history-contract";
import { KeywordDetailHistory } from "@/components/keyword-detail-history/KeywordDetailHistory";
import { LegacyPositionHistoryPlot } from "@/components/keyword-detail-history/LegacyPositionHistoryPlot";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ZonedTime } from "@/components/ui/ZonedTime";
import { observationSeries } from "@/lib/checks/position-observations";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/dates/format";
import type { KeywordDetailChartState } from "@/lib/keyword-detail/state-model";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import {
  comparisonTargets,
  keywordMarketLabel,
  marketComparisonData,
} from "@/lib/keywords/market-position-history";
import { calendarDayKey, dailyPositionPoints } from "@/lib/keywords/position-history";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { PositionHistoryHeader, PositionHistoryNotes } from "./PositionHistoryHeader";
import { PositionHistoryMarketLegend } from "./PositionHistoryMarketLegend";
import { positionHistorySeries } from "./position-history-series";

export { historyAnnotationTop } from "./PositionHistoryAnnotations";

type PositionHistoryCardProps = {
  history?: KeywordHistoryPort;
  chartState?: KeywordDetailChartState;
  keyword: KeywordRow;
  marketTargets?: readonly KeywordRow[];
  timeZone: string;
};

const RANGES = [
  { days: 7, value: "7d" },
  { days: 30, value: "30d" },
  { days: 90, value: "90d" },
] as const;

type RangeLabel = (typeof RANGES)[number]["value"];

function localizedDayLabel(
  dayKey: string,
  today: string,
  t: (key: "today") => string,
  dateDisplay: ReturnType<typeof useDateDisplay>,
) {
  if (dayKey === today) return t("today");
  return formatDisplayDateRange(dayKey, dayKey, { ...dateDisplay, timeZone: "UTC" });
}

function LegacyPositionHistoryCard({
  chartState,
  keyword,
  marketTargets = [keyword],
  timeZone,
}: Readonly<PositionHistoryCardProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.position");
  const pending = useTranslations("projectRankTracker.keywordDetail.pending");
  const [range, setRange] = useState<RangeLabel>("30d");
  const [scope, setScope] = useState<"all" | "single">("single");
  const dateDisplay = useDateDisplay();
  const { readOnly } = useProjectWriteMode();
  const activeRange = RANGES.find((option) => option.value === range) ?? RANGES[1];
  const now = new Date();
  const today = calendarDayKey(now);
  const history = dailyPositionPoints(
    keyword.positionObservations ?? keyword.positionHistory,
    activeRange.days,
    now,
  ).map((point) => ({
    ...point,
    label: localizedDayLabel(calendarDayKey(new Date(point.checkedAt)), today, t, dateDisplay),
  }));
  const markets = comparisonTargets(marketTargets, keyword);
  const visibleMarkets = markets.slice(0, 6);
  const showComparison = markets.length > 1;
  const allMarkets = showComparison && scope === "all";
  const comparison = marketComparisonData(visibleMarkets, activeRange.days, now);
  const comparisonLabels = comparison.labels.map((label) =>
    localizedDayLabel(label, today, t, dateDisplay),
  );
  const boundaryVisible =
    observationSeries(history).length > 1 ||
    (history.length > 0 &&
      Boolean(
        keyword.positionHistoryBoundaryAt &&
          dailyPositionPoints(
            [{ checkedAt: keyword.positionHistoryBoundaryAt }],
            activeRange.days,
            now,
          ).length,
      ));
  const labels = history.map((point) => point.label);
  const positions = history.map((point) => point.position);
  const target = keyword.targetPosition ?? null;
  const comparisonPositions = comparison.values.flatMap((series) =>
    series.data.flatMap((position) => (position === null ? [] : [position])),
  );
  const maxPosition = Math.max(
    20,
    ...(allMarkets
      ? comparisonPositions
      : positions.filter((position): position is number => position !== null)),
    target ?? 1,
  );
  const rangeEmpty = positions.length === 0;
  const notEnough = allMarkets
    ? comparison.labels.length === 0
    : positions.every((position) => position === null) ||
      ((chartState === "one_check" || !chartState) && history.length < 2);
  const chartLabels = allMarkets ? comparisonLabels : labels;
  const notRankedTitle =
    keyword.observationCompleteness === "unknown" ||
    keyword.observationCompleteness === "truncated_by_stop_on_match"
      ? pending("coverageUnknownTitle")
      : pending("notRankedTitle", {
          depth: keyword.trackedDepth ?? keyword.projectSerpDepth ?? 20,
        });
  const emptyStateTitle = rangeEmpty
    ? t("noChecks", { days: activeRange.days })
    : positions.every((position) => position === null)
      ? notRankedTitle
      : t("notEnough");
  const latestForAria = positions.at(-1);
  const chartRegionLabel = notEnough
    ? `${keyword.keyword}: ${emptyStateTitle}`
    : allMarkets
      ? t("allMarketsAria", {
          markets: visibleMarkets
            .map((market) =>
              market.hasRankData && market.position !== null
                ? t("marketPosition", {
                    market: keywordMarketLabel(market),
                    position: market.position,
                  })
                : `${keywordMarketLabel(market)} ${t("positionUnavailable")}`,
            )
            .join(", "),
        })
      : latestForAria == null || target === null
        ? t("historyAria", { keyword: keyword.keyword })
        : latestForAria > target
          ? t("historyAriaWithTarget", {
              distance: latestForAria - target,
              keyword: keyword.keyword,
              position: latestForAria,
              target,
            })
          : t("historyAriaTargetReached", {
              keyword: keyword.keyword,
              position: latestForAria,
              target,
            });
  const chartSeries = positionHistorySeries({
    allMarkets,
    comparison: comparison.values,
    history,
    maxPosition,
    label: t("positionSeries"),
  });
  const latestObservation = (keyword.positionObservations ?? keyword.positionHistory).at(-1);
  const latestPosition = latestObservation?.position ?? null;
  const displayedPosition = positions.at(-1) ?? latestPosition;
  const latestCheckedAt = latestObservation?.checkedAt;
  const latestChip =
    latestPosition !== null && latestPosition > 0
      ? t("latest", {
          date: latestCheckedAt
            ? formatDisplayDate(calendarDayKey(new Date(latestCheckedAt), timeZone), {
                ...dateDisplay,
                timeZone,
              })
            : t("today"),
          position: latestPosition,
        })
      : latestObservation?.position === null
        ? `${notRankedTitle}${latestCheckedAt ? ` · ${formatDisplayDate(calendarDayKey(new Date(latestCheckedAt), timeZone), { ...dateDisplay, timeZone })}` : ""}`
        : t("latestUnavailable");
  const effectiveSchedule = resolveEffectiveSchedule(keyword.schedule);
  const nextCheckLabel: ReactNode = readOnly ? (
    t("pausedMigration")
  ) : effectiveSchedule.frequency === "paused" ? (
    t("paused")
  ) : !effectiveSchedule.nextCheckAt ? (
    t("notScheduled")
  ) : (
    <ZonedTime timeZone={timeZone} value={effectiveSchedule.nextCheckAt.toISOString()} />
  );

  return (
    <Card className="rounded-card" size="lg">
      <PositionHistoryHeader
        keyword={keyword}
        marketLabel={allMarkets ? t("markets", { count: markets.length }) : undefined}
        latestCheck={allMarkets ? null : latestChip}
      >
        {showComparison ? (
          <SegmentedControl
            ariaLabel={t("scope")}
            fitContent
            onChange={setScope}
            options={[
              { label: t("thisMarket"), value: "single" },
              { label: t("allMarkets"), value: "all" },
            ]}
            size="xs"
            value={scope}
          />
        ) : null}
        <SegmentedControl
          ariaLabel={t("range")}
          className="bg-bg-elev font-sans tabular-nums"
          fitContent
          onChange={(value) => setRange(value as RangeLabel)}
          options={RANGES.map((option) => ({
            label: t("rangeDays", { count: option.days }),
            value: option.value,
          }))}
          size="xs"
          value={range}
        />
      </PositionHistoryHeader>
      <LegacyPositionHistoryPlot
        allMarkets={allMarkets}
        chartLabels={chartLabels}
        chartRegionLabel={chartRegionLabel}
        chartSeries={chartSeries}
        comparison={comparison}
        displayedPosition={displayedPosition}
        emptyStateTitle={emptyStateTitle}
        history={history}
        keyword={keyword}
        labels={labels}
        maxPosition={maxPosition}
        nextCheckLabel={nextCheckLabel}
        notEnough={notEnough}
        positions={positions}
        target={target}
      />
      <PositionHistoryNotes
        hasGaps={positions.some((position) => position === null)}
        boundaryVisible={boundaryVisible}
      />
      {!notEnough ? (
        <PositionHistoryMarketLegend
          allMarkets={allMarkets}
          comparisonPoints={comparison.values.map((series) => series.points)}
          history={history}
          markets={markets}
          visibleMarkets={visibleMarkets}
        />
      ) : null}
    </Card>
  );
}

export function PositionHistoryCard(props: Readonly<PositionHistoryCardProps>) {
  if (props.history)
    return (
      <KeywordDetailHistory
        history={props.history}
        keyword={props.keyword.keyword}
        timeZone={props.timeZone}
      />
    );
  return <LegacyPositionHistoryCard {...props} />;
}
