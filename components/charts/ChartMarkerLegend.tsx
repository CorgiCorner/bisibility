"use client";

import { AnnotationLegendChip } from "@/components/annotations/AnnotationLegendChip";
import { AnnotationEntryRow } from "@/components/annotations/AnnotationMarkerBadge";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Switch } from "@/components/ui/Switch";
import {
  type ChartMarker,
  type ChartMarkerKind,
  chartMarkerLegendKinds,
  markerLetter,
  markerToneContent,
  markerToneDeploy,
  markerToneNote,
  markerToneSearchEngine,
  markerToneSitemap,
} from "@/lib/annotations/marker-style";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import "@/components/ui/FloatingSelectionBar.module.css";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ChartMarkerPin } from "./chart-marker-layout";
import { useChartMarkerPreference } from "./chart-marker-preference";
import { chartMarkerTitle } from "./chart-marker-title";

export const chartMarkerKindLabel = {
  content: "content",
  deploy: "deploy",
  note: "note",
  search_engine: "searchEngine",
  sitemap: "sitemap",
} as const;

export const CHART_MARKER_TOOLTIP_LIMIT = 5;

export function ChartMarkerLegend({
  markers,
  projectRef,
  series,
}: Readonly<{
  series?: ReactNode;
  markers: readonly ChartMarker[];
  projectRef?: string;
}>) {
  const t = useTranslations("shared.chartMarkers");
  const { preference, setEnabled, toggleKind } = useChartMarkerPreference(projectRef);
  const counts = new Map<ChartMarkerKind, number>();
  for (const marker of markers) counts.set(marker.kind, (counts.get(marker.kind) ?? 0) + 1);
  const kinds = chartMarkerLegendKinds.filter((kind) => (counts.get(kind) ?? 0) > 0);
  return (
    <div
      aria-label={t("legendAria")}
      className="mt-2 flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto"
      data-tab-strip=""
    >
      {series}
      {markers.length > 0 ? (
        <>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Switch
              checked={preference.enabled}
              className="border-0 bg-transparent px-0 py-0 text-ui-caption font-medium text-fg"
              label={t("markers")}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
            />
            <InfoTooltip text={t("fromAnnotations")} />
          </span>
          {preference.enabled
            ? kinds.map((kind) => {
                const on = preference.kinds[kind] !== false;
                const tone = on
                  ? kind === "content"
                    ? markerToneContent
                    : kind === "deploy"
                      ? markerToneDeploy
                      : kind === "note"
                        ? markerToneNote
                        : kind === "search_engine"
                          ? markerToneSearchEngine
                          : markerToneSitemap
                  : "text-fg-muted";
                return (
                  <AnnotationLegendChip
                    className={cn(on ? "border-current" : "border-border", tone)}
                    count={counts.get(kind)}
                    key={kind}
                    label={t(chartMarkerKindLabel[kind])}
                    marker={markerLetter(kind)}
                    onClick={() => toggleKind(kind)}
                    pressed={on}
                  />
                );
              })
            : null}
          {projectRef ? (
            <Button
              className="ml-auto shrink-0"
              endIcon={<CaretRight aria-hidden size={14} weight="regular" />}
              href={appPath(asProjectRef(projectRef), "annotations")}
              size="xs"
              type="button"
              variant="ghost"
            >
              {t("openAnnotations")}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ChartMarkerDayValues({
  formatValue,
  index,
  label,
  markers,
  series,
}: Readonly<{
  formatValue?: (value: number) => string;
  index: number;
  label: string;
  markers: readonly ChartMarker[];
  series: readonly {
    formatValue?: (value: number) => string;
    label: string;
    values: readonly (number | null)[];
  }[];
}>) {
  return (
    <div className="grid gap-0.5 font-sans tabular-nums">
      <p className="m-0">{label}</p>
      {series.map((item, seriesIndex) => {
        const value = item.values[index];
        if (typeof value !== "number") return null;
        const rendered = (item.formatValue ?? formatValue)?.(value) ?? String(value);
        return (
          <p className="m-0" key={`${item.label}-${seriesIndex}`}>
            {item.label} {rendered}
          </p>
        );
      })}
      <ChartMarkerTooltipList markers={markers} />
    </div>
  );
}

export function ChartMarkerTooltipList({
  markers,
  projectRef,
}: Readonly<{
  markers: readonly ChartMarker[];
  projectRef?: string;
}>) {
  const t = useTranslations("shared.chartMarkers");
  if (markers.length === 0) return null;
  return (
    <ul className="m-0 mt-1 grid list-none gap-1.5 p-0">
      {markers.map((marker) => (
        <li key={marker.id}>
          <AnnotationEntryRow
            marker={markerLetter(marker.kind)}
            source={
              marker.source
                ? t("sourceLine", {
                    source: marker.source,
                    type: t(chartMarkerKindLabel[marker.kind]),
                  })
                : undefined
            }
            title={
              projectRef ? (
                <a
                  className="rounded-control outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-solid"
                  href={`${appPath(asProjectRef(projectRef), "annotations")}?q=${encodeURIComponent(marker.id)}`}
                >
                  {chartMarkerTitle(marker, t)}
                </a>
              ) : (
                chartMarkerTitle(marker, t)
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function ChartMarkerPinBody({
  date,
  pin,
  projectRef,
}: Readonly<{ date: string; pin: ChartMarkerPin; projectRef?: string }>) {
  const t = useTranslations("shared.chartMarkers");
  const shown = pin.markers.slice(0, CHART_MARKER_TOOLTIP_LIMIT);
  const extra = pin.markers.length - shown.length;
  return (
    <div className="grid gap-1.5 font-sans text-ui-caption text-fg">
      <p className="m-0 text-fg-muted">
        {pin.count > 1 ? t("clusterHeading", { count: pin.count, date }) : date}
      </p>
      <ChartMarkerTooltipList markers={shown} projectRef={projectRef} />
      {extra > 0 ? (
        <p className="m-0 pl-6 text-ui-caption text-fg-muted">
          {t("clusterMore", { count: extra })}
        </p>
      ) : null}
    </div>
  );
}
