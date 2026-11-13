"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import {
  ConversionConnectLink,
  ConversionSourceSwitch,
} from "@/components/conversions/ConversionSourceSwitch";
import { Card } from "@/components/ui/Card";
import type { StatTileDirection } from "@/components/ui/StatTile";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import type { OrganicConversionsWidget } from "@/lib/conversions/surface";
import { defaultProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/dist/csr/ArrowDownRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { DashboardWidgetLink } from "./DashboardWidgetLink";

function conversionDelta(
  current: number,
  previous: number,
  days: number,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectDashboard.organicConversions">>,
): { direction: StatTileDirection; label: string } {
  if (previous <= 0) {
    return {
      direction: current > 0 ? "up" : "flat",
      label: current > 0 ? t("deltaNew") : t("deltaUnchanged"),
    };
  }
  const change = (current - previous) / previous;
  const direction: StatTileDirection = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return {
    direction,
    label: t("deltaVersus", {
      days,
      value: format.number(change, {
        maximumFractionDigits: 1,
        signDisplay: "always",
        style: "percent",
      }),
    }),
  };
}

export function OrganicConversionsCard({
  comparisonDays = 28,
  markers,
  model,
  projectRef,
}: Readonly<{
  comparisonDays?: number;
  markers?: readonly ChartMarker[];
  model: OrganicConversionsWidget | null;
  projectRef: ProjectRef;
}>) {
  const t = useTranslations("projectDashboard.organicConversions");
  const format = useFormatter();
  const search = appPath(projectRef, "search-console");
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-ui-section font-semibold">{t("title")}</h2>
        {model?.kind === "ready" && model.selection.showSwitch && model.selection.selected ? (
          <ConversionSourceSwitch
            options={model.selection.options}
            size="header"
            value={model.selection.selected}
          />
        ) : null}
      </div>
      {model?.kind === "connect" || model == null ? (
        <div className="mt-3">
          <ConversionConnectLink projectId={projectRef} />
        </div>
      ) : model.kind === "error" ? (
        <p className="m-0 mt-3 text-ui-caption text-fg-muted">{t("unavailable")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-sans tabular-nums text-ui-h1">
              {format.number(model.current)}
            </span>
            <ConversionDelta
              current={model.current}
              days={comparisonDays}
              previous={model.previous}
            />
          </div>
          {model.series.length > 0 ? (
            <TimeSeriesChart
              dateKeys={model.series.map((point) => point.date)}
              height={160}
              labels={model.series.map((point) => point.date)}
              markerProjectRef={projectRef}
              markers={markers}
              series={[
                {
                  color: "var(--accent)",
                  label: t("title"),
                  values: model.series.map((point) => point.totalCount),
                },
              ]}
            />
          ) : null}
          <div className="mt-1">
            <div className="flex items-center justify-between px-2 text-ui-micro text-fg-muted">
              <span>{t("topPages")}</span>
              <span>{t("conversions")}</span>
            </div>
            <ul className="m-0 list-none p-0">
              {model.pages.map((page) => (
                <li key={page.path}>
                  <Link
                    className="flex items-center justify-between gap-3 rounded-control px-2 py-1 text-ui-caption hover:bg-bg-sunken"
                    href={projectPagesHref(projectRef, {
                      ...defaultProjectPagesQuery,
                      search: page.path,
                    })}
                  >
                    <span className="truncate font-sans">{page.path}</span>
                    <span className="tabular-nums">{format.number(page.conversions)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <DashboardWidgetLink
            href={model.selection.selected ? `${search}?conv=${model.selection.selected}` : search}
          >
            {t("openSearchConsole")}
          </DashboardWidgetLink>
        </div>
      )}
    </Card>
  );
}

function ConversionDelta({
  current,
  days,
  previous,
}: Readonly<{ current: number; days: number; previous: number }>) {
  const t = useTranslations("projectDashboard.organicConversions");
  const format = useFormatter();
  const delta = conversionDelta(current, previous, days, format, t);
  const Arrow =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-sans tabular-nums text-ui-caption",
        delta.direction === "up" ? "text-green-text" : "text-fg-muted",
      )}
    >
      {Arrow ? <Arrow aria-hidden className="shrink-0" size={12} weight="regular" /> : null}
      {delta.label}
    </span>
  );
}
