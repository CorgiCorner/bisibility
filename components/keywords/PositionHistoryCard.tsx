"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card, ChartRegion, MonoText, SectionTitle } from "@/components/ui";
import { resolveEffectiveSchedule } from "@/lib/keywords/effective-schedule";
import {
  dailyPositionPoints,
  POSITION_DIRECTION_CUE,
  positionHistoryAriaLabel,
  positionTargetAnnotation,
} from "@/lib/keywords/position-history";
import type { KeywordRow } from "@/lib/queries/keywords";
import { chartColors } from "@/lib/theme/chart-colors";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { useDrawingArea, useXScale, useYScale } from "@mui/x-charts/hooks";
import { LineChart } from "@mui/x-charts/LineChart";
import { useState } from "react";

type PositionHistoryCardProps = {
  keyword: KeywordRow;
};

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

const axisTextStyle = {
  fill: "var(--fg-faint)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
};

const nextCheckFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
});

function scheduleStatus(keyword: KeywordRow) {
  const schedule = resolveEffectiveSchedule(keyword.schedule);
  if (schedule.frequency === "paused") return "Paused";
  if (!schedule.nextCheckAt) return "Not scheduled";
  return `Next check ${nextCheckFormatter.format(schedule.nextCheckAt)}`;
}

export function historyAnnotationTop({
  bottom,
  latest,
  previous,
  target,
  top,
}: {
  bottom: number;
  latest: number;
  previous: number | null;
  target: number | null;
  top: number;
}) {
  const height = 18;
  const aboveIsClear = previous !== null && previous - latest >= height;
  const belowIsClear = previous !== null && latest - previous >= height;
  let placeAbove = aboveIsClear && !belowIsClear;
  if (placeAbove && latest - height - 4 < top) placeAbove = false;
  if (!placeAbove && latest + height + 4 > bottom) placeAbove = true;
  let chipTop = placeAbove ? latest - height - 4 : latest + 4;
  if (target !== null && target >= chipTop - 1 && target <= chipTop + height + 1) {
    chipTop += placeAbove ? -12 : 12;
  }
  return chipTop;
}

function TargetReferenceLine({ target }: Readonly<{ target: number }>) {
  const { top } = useDrawingArea();
  const yScale = useYScale();
  const position = yScale(target);
  const labelBelow = typeof position === "number" && position - top < 14;

  return (
    <ChartsReferenceLine
      label={`TARGET #${target}`}
      labelAlign="start"
      labelStyle={{
        fill: "var(--fg-muted)",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.5px",
      }}
      lineStyle={{
        stroke: chartColors.green,
        strokeDasharray: "4 3",
        strokeWidth: 1,
      }}
      spacing={{ x: 0, y: labelBelow ? -14 : 4 }}
      y={target}
    />
  );
}

function LatestPositionAnnotation({
  labels,
  positions,
  target,
}: Readonly<{ labels: string[]; positions: number[]; target: number }>) {
  const { height, left, top, width } = useDrawingArea();
  const xScale = useXScale<"point">();
  const yScale = useYScale<"linear">();
  const position = positions.at(-1);
  const label = labels.at(-1);
  if (position === undefined || label === undefined) return null;
  const markerX = xScale(label);
  const markerY = yScale(position);
  const previousPosition = positions.at(-2);
  const previousY = previousPosition === undefined ? null : yScale(previousPosition);
  const targetY = yScale(target);
  if (typeof markerX !== "number" || typeof markerY !== "number") return null;

  const copy = positionTargetAnnotation(position, target);
  const chipWidth = Math.min(copy.length * 6 + 10, width - 24);
  const chipRight = left + width - 12;
  const chipTop = historyAnnotationTop({
    bottom: top + height,
    latest: markerY,
    previous: typeof previousY === "number" ? previousY : null,
    target: typeof targetY === "number" ? targetY : null,
    top,
  });
  return (
    <g aria-hidden>
      <circle
        cx={markerX}
        cy={markerY}
        fill="var(--accent)"
        r={4}
        stroke="var(--bg-elev)"
        strokeWidth={2}
      />
      <rect
        fill="var(--bg-elev)"
        height={18}
        rx={4}
        stroke="var(--border)"
        width={chipWidth}
        x={chipRight - chipWidth}
        y={chipTop}
      />
      <text
        fill="var(--fg-muted)"
        fontFamily="var(--font-mono), monospace"
        fontSize={10}
        fontWeight={400}
        textAnchor="end"
        x={chipRight - 5}
        y={chipTop + 12}
      >
        {copy}
      </text>
    </g>
  );
}

export function PositionHistoryCard({ keyword }: Readonly<PositionHistoryCardProps>) {
  const [range, setRange] = useState<RangeLabel>("30d");
  const { readOnly } = useProjectWriteMode();
  const activeRange = RANGES.find((option) => option.label === range) ?? RANGES[1];
  const history = dailyPositionPoints(keyword.positionHistory, activeRange.days);
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
  const maxPosition = Math.max(20, ...positions, target ?? 1);
  const rangeEmpty = positions.length === 0;
  const notEnough = positions.length < 2;
  const latestPosition = keyword.positionHistory.at(-1)?.position ?? null;
  const displayedPosition = positions.at(-1) ?? latestPosition;
  const nextCheckStatus = readOnly ? "Paused - migration hold" : scheduleStatus(keyword);

  return (
    <Card className="rounded-[14px]" size="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Position history</SectionTitle>
          <MonoText muted>{`GOOGLE RANK OVER TIME / ${POSITION_DIRECTION_CUE}`}</MonoText>
          {boundaryVisible ? (
            <p className="mt-1 text-[11px] text-fg-muted">
              Comparison restarted after a ranking normalization change.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 rounded-[9px] border border-border-strong bg-bg-elev p-0.5">
          {RANGES.map((option) => (
            <button
              className={[
                "rounded-[7px] px-3 py-1.5 font-mono text-[11.5px] outline-none transition-colors focus-visible:outline-none",
                option.label === range ? "bg-accent text-white" : "text-fg-muted hover:text-fg",
              ].join(" ")}
              key={option.label}
              onClick={() => setRange(option.label)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <ChartRegion
        className="relative mt-3 h-[280px]"
        label={positionHistoryAriaLabel(keyword.keyword, positions.at(-1), target)}
      >
        <LineChart
          grid={{ horizontal: true }}
          height={280}
          hideLegend
          margin={{ top: 18, right: 18, bottom: 28, left: 42 }}
          series={[
            {
              area: true,
              baseline: maxPosition,
              color: chartColors.accent,
              curve: "linear",
              data: positions,
              label: "Position",
              showMark: false,
            },
          ]}
          skipAnimation
          sx={{
            "& .MuiAreaElement-root": { fill: "var(--accent)", fillOpacity: 0.1 },
            "& .MuiChartsGrid-line": { stroke: "var(--border)" },
            "& .MuiChartsAxis-tickLabel": axisTextStyle,
            "& .MuiLineElement-root": {
              stroke: "var(--accent)",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              strokeWidth: 2.8,
            },
          }}
          xAxis={[
            {
              data: labels,
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
              tickLabelStyle: axisTextStyle,
            },
          ]}
        >
          {target !== null && !rangeEmpty ? <TargetReferenceLine target={target} /> : null}
          {target !== null && !rangeEmpty ? (
            <LatestPositionAnnotation labels={labels} positions={positions} target={target} />
          ) : null}
        </LineChart>
        {notEnough ? (
          <div
            className="absolute inset-0 grid place-items-center rounded-[12px]"
            style={{ background: "color-mix(in srgb, var(--bg-elev) 72%, transparent)" }}
          >
            <div className="flex flex-col items-center gap-2 rounded-[12px] border border-border-strong bg-bg-elev px-5 py-4 text-center">
              <p className="m-0 text-[13px] font-semibold text-fg">
                {rangeEmpty ? "No checks in this range" : "Not enough history to chart yet"}
              </p>
              <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">
                {rangeEmpty
                  ? `No checks in the last ${activeRange.days} days.`
                  : "One check so far. The trend line appears after the next check."}
              </p>
              {displayedPosition !== null ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-bg-sunken px-3 py-1 font-mono text-[11px] text-fg-muted">
                  {rangeEmpty ? "Latest" : "Current"} #{displayedPosition} / {nextCheckStatus}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </ChartRegion>
    </Card>
  );
}
