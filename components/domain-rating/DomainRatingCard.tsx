"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { DashboardEmptyBody } from "@/components/dashboard-layout/DashboardEmptyBody";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChartRegion } from "@/components/ui/ChartRegion";
import { Tooltip } from "@/components/ui/Tooltip";
import { buildRatingSeries, type DomainRatingView } from "@/lib/domain-rating/history";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export function DomainRatingCard({
  data,
  today,
}: Readonly<{ data: DomainRatingView; today: string }>) {
  const t = useTranslations("shared.domainRating");
  const format = useFormatter();
  const [days, setDays] = useState(90);
  const points = buildRatingSeries(data.points, today, days);
  const measured = points.filter((point) => point.rating !== null);
  const latest = measured.at(-1)?.rating ?? null;
  const first = measured[0]?.rating ?? null;
  const delta = latest !== null && first !== null ? latest - first : null;
  const project = asProjectRef(data.projectId);
  const showAttribution =
    data.source !== null || data.points.some((point) => point.rating !== null);
  const status = !data.domain
    ? t("noDomain")
    : !data.enabled
      ? t("paused")
      : data.lastError
        ? t("failure")
        : !data.source
          ? t("emptyHelp")
          : t("waiting");
  const change =
    measured.length < 2
      ? t(latest === null ? "noValue" : "single")
      : delta === 0
        ? t("unchanged")
        : t("change", {
            value: `${(delta ?? 0) > 0 ? "+" : ""}${format.number(delta ?? 0, { maximumFractionDigits: 1 })}`,
          });
  return (
    <div className="min-w-0">
      <Card
        className="flex min-h-[24.625rem] min-w-0 flex-col p-4"
        size="md"
        data-domain-rating-card=""
      >
        <div
          className="flex min-h-24 flex-wrap items-start justify-between gap-x-4 gap-y-2"
          data-rating-header=""
        >
          <div>
            <Tooltip content={t("definition")} semantics="description">
              <h2 className="m-0 text-sm font-semibold">{t("title")}</h2>
            </Tooltip>
            <p className="mb-0 mt-0.5 text-[11px] text-fg-muted">{data.domain ?? t("noDomain")}</p>
          </div>
          <fieldset
            aria-label={t("range")}
            className="order-3 m-0 flex min-w-0 basis-full justify-end gap-1 border-0 p-0 sm:order-2 sm:ml-auto sm:basis-auto"
          >
            {[30, 90, 365].map((range) => (
              <Button
                className="h-10 px-2 text-[11px] sm:h-7"
                key={range}
                size="sm"
                variant={days === range ? "secondary" : "ghost"}
                aria-pressed={days === range}
                onClick={() => setDays(range)}
              >
                {t("days", { count: format.number(range) })}
              </Button>
            ))}
          </fieldset>
          <div className="order-2 shrink-0 text-right sm:order-3">
            <output
              aria-label={t("latest")}
              className="text-2xl font-semibold tabular-nums tracking-tight"
            >
              {latest === null ? "-" : format.number(latest, { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[11px] font-normal text-fg-muted">/ 100</span>
            </output>
            <span className="block text-[10px] text-fg-muted">{change}</span>
          </div>
        </div>
        {latest === null ? (
          <DashboardEmptyBody title={t("empty")} description={status} />
        ) : (
          <ChartRegion
            className="mt-1 min-h-[140px] flex-1"
            label={t("chartLabel", { domain: data.domain ?? "" })}
          >
            <TimeSeriesChart
              height={140}
              dateAxisLayout="aligned"
              min={0}
              max={100}
              yTicks={[0, 25, 50, 75, 100]}
              yWidth={26}
              xTickIndexes={[0, Math.floor((points.length - 1) / 2), points.length - 1]}
              labels={points.map((point) => point.day)}
              dateKeys={points.map((point) => point.day)}
              series={[
                {
                  label: t("title"),
                  values: points.map((point) => point.rating),
                  color: "var(--blue)",
                  fill: true,
                  dots: measured.length < 20,
                  curve: "linear",
                },
              ]}
              showVerticalGrid
              gridDashed
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              formatValue={(value) => format.number(value, { maximumFractionDigits: 1 })}
            />
          </ChartRegion>
        )}
        {latest !== null && (!data.enabled || data.lastError || !data.source) ? (
          <p role="status" className="mb-0 mt-2 text-[11px] text-fg-muted">
            {status}
          </p>
        ) : null}
        <div
          className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-soft pt-2 text-[10px] text-fg-muted"
          data-rating-footer=""
        >
          <Tooltip
            semantics="description"
            content={
              data.lastSuccessAt
                ? t("lastSuccess", {
                    date: format.dateTime(new Date(data.lastSuccessAt), {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }),
                  })
                : t("unknown")
            }
          >
            <span>{data.enabled ? t("daily") : t("paused")}</span>
          </Tooltip>
          <Link
            className="font-medium text-fg underline underline-offset-2"
            href={
              data.source
                ? `${appPath(project, "/settings/data-sources")}#domain-rating`
                : `${appPath(project, "/providers")}?connect=ahrefs#provider-ahrefs`
            }
          >
            {t(data.source ? "settings" : "connect")}
          </Link>
        </div>
        <section className="sr-only" aria-label={t("history")}>
          <dl>
            {points.map((point) => (
              <div key={point.day}>
                <dt>
                  {t("date")}: {point.day}
                </dt>
                <dd>
                  {t("rating")}:{" "}
                  {point.rating === null ? t("missing") : format.number(point.rating)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </Card>
      {showAttribution ? (
        <p className="m-0 px-1 pt-1 text-[10px] leading-4 text-fg-muted">
          <a
            className="underline-offset-2 hover:underline"
            href="https://ahrefs.com/"
            target="_blank"
            rel="noreferrer"
          >
            {t("attribution")}
          </a>
        </p>
      ) : null}
    </div>
  );
}
