"use client";

import { ChartRegion } from "@/components/ui/ChartRegion";
import { EmptyState } from "@/components/ui/EmptyState";
import { chartColors } from "@/lib/theme/chart-colors";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { historyTimestampFraction, recordedHistorySegments } from "./history-chart-model";
import type { ObservationHistoryPage } from "./history-contract";

function useRecordedChartWidth() {
  const [width, setWidth] = useState(680);
  const ref = useCallback((node: SVGSVGElement | null) => {
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 56) setWidth(Math.round(node.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Numeric timestamp geometry; no ordinal day spacing, interpolation across gaps or rank substitution. */
export function RecordedHistoryChart({
  page,
  onOpen,
  timeZone,
}: Readonly<{
  page: ObservationHistoryPage;
  onOpen: (checkId: string) => void;
  timeZone: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { ref, width } = useRecordedChartWidth();
  const { segments, gaps, boundaries } = recordedHistorySegments(page);
  const from = Date.parse(page.window.from);
  const to = Date.parse(page.window.to);
  const positions = segments.flatMap((segment) => segment.points.map(({ position }) => position));
  const max = positions.reduce((max, position) => Math.max(max, position), 20);
  const left = 40,
    right = width - 16,
    top = 12,
    bottom = 240;
  const x = (at: number) => {
    const fraction = historyTimestampFraction(page.window, at);
    return fraction === null ? null : left + fraction * (right - left);
  };
  const y = (position: number) => top + ((position - 1) / (max - 1)) * (bottom - top);
  const ticks = [from, from + (to - from) / 2, to];
  const validWindow = Number.isFinite(from) && Number.isFinite(to) && from <= to;
  const completeWindow = page.records.length === page.totalCount && page.nextCursor === null;
  const empty = !validWindow || positions.length === 0;
  return (
    <>
      <ChartRegion
        className={empty ? "relative" : "relative mt-2 h-[280px]"}
        label={t("chartAria")}
      >
        {empty ? (
          <EmptyState
            compact
            title={t("noQualifiedPoints")}
            description={t("noPositionsDescription")}
          />
        ) : (
          <svg
            aria-label={t("chartAria")}
            ref={ref}
            viewBox={`0 0 ${width} 280`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {[1, 10, max].map((position) => (
              <g key={position}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(position)}
                  y2={y(position)}
                  stroke="var(--border)"
                />
                <text
                  x={left - 8}
                  y={y(position) + 4}
                  textAnchor="end"
                  fill="var(--fg-muted)"
                  fontSize={10}
                >
                  {position}
                </text>
              </g>
            ))}
            {ticks.map((at, index) => (
              <text
                key={index}
                x={x(at) ?? undefined}
                y={265}
                textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
                fill="var(--fg-muted)"
                fontSize={10}
              >
                {format.dateTime(new Date(at), { month: "short", day: "numeric", timeZone })}
              </text>
            ))}
            {segments.map((segment) => (
              <g key={segment.key} data-testid="recorded-history-segment">
                {completeWindow ? (
                  <polyline
                    fill="none"
                    stroke={chartColors.accent}
                    strokeWidth={2}
                    points={segment.points
                      .map((point) => `${x(point.at)},${y(point.position)}`)
                      .join(" ")}
                  />
                ) : null}
                {segment.points.map(({ observation, at, position }) =>
                  x(at) === null ? null : (
                    <foreignObject
                      key={observation.id}
                      x={(x(at) ?? left) - 6}
                      y={y(position) - 6}
                      width={12}
                      height={12}
                      overflow="visible"
                    >
                      <button
                        type="button"
                        className="block h-full w-full rounded-full border-2 border-bg-elev p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        style={{ backgroundColor: chartColors.accent }}
                        aria-label={t("openObservation", { id: observation.id })}
                        data-observation-at={at}
                        onClick={() => onOpen(observation.id)}
                        title={t("point", {
                          position: format.number(position),
                          date: format.dateTime(new Date(at), {
                            dateStyle: "full",
                            timeStyle: "long",
                            timeZone,
                          }),
                        })}
                      />
                    </foreignObject>
                  ),
                )}
              </g>
            ))}
          </svg>
        )}
      </ChartRegion>
      {!empty ? (
        <>
          <p className="m-0 mt-3 text-[11px] text-fg-muted">
            {t("chartLoaded", {
              loaded: format.number(page.records.length),
              total: format.number(page.totalCount),
              gaps: format.number(gaps),
              boundaries: format.number(boundaries),
            })}
          </p>
          <p className="m-0 mt-1 text-[11px] text-fg-muted">{t("chartMeaning")}</p>
          {!completeWindow ? (
            <p className="m-0 mt-1 text-[11px] text-fg-muted">{t("chartPartial")}</p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
