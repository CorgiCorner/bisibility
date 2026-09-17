"use client";

import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useFormatter, useTranslations } from "next-intl";
import type { DataSourceHealth } from "./types";

export type DataSourcePanelProps = {
  checkHealth?: {
    budget: { exhausted: boolean };
    failed24h: { count: number };
  };
  health: DataSourceHealth;
};

function providerLabel(provider: string) {
  if (provider === "dataforseo") return "DataForSEO";
  if (provider === "serpapi") return "SerpApi";
  return provider;
}

function relativeTime(
  value: string,
  now: string,
  direction: "future" | "past",
  t: ReturnType<typeof useTranslations<"projectDashboard.dataSource">>,
) {
  const difference = new Date(value).getTime() - new Date(now).getTime();
  const minutes =
    direction === "future"
      ? Math.ceil(difference / 60_000)
      : Math.max(0, Math.floor(-difference / 60_000));
  if (direction === "future") {
    if (minutes <= 0) return t("relativeDueNow");
    if (minutes < 60) return t("relativeMinutesFuture", { value: minutes });
    const hours = Math.ceil(minutes / 60);
    return hours < 24
      ? t("relativeHoursFuture", { value: hours })
      : t("relativeDaysFuture", { value: Math.ceil(hours / 24) });
  }
  if (minutes < 1) return t("relativeJustNow");
  if (minutes < 60) return t("relativeMinutesPast", { value: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("relativeHoursPast", { value: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("relativeYesterday") : t("relativeDaysPast", { value: days });
}

export function DataSourceMetrics({ health }: Readonly<{ health: DataSourceHealth }>) {
  const format = useFormatter();
  const t = useTranslations("projectDashboard.dataSource");
  const metrics = [
    {
      label: t("primaryProvider"),
      value: health.primaryProvider ? providerLabel(health.primaryProvider) : t("notConfigured"),
    },
    {
      label: t("lastCheckVia"),
      value: health.lastCheckProvider ? providerLabel(health.lastCheckProvider) : t("never"),
    },
    {
      label: t("lastCheck"),
      value: health.lastCheckAt
        ? relativeTime(health.lastCheckAt, health.now, "past", t)
        : t("never"),
    },
    {
      label: t("nextCheck"),
      value:
        health.status === "migrationHold"
          ? t("pausedMigrationHold")
          : health.nextCheckAt
            ? relativeTime(health.nextCheckAt, health.now, "future", t)
            : t("noScheduledChecks"),
    },
    { label: t("checksThisMonth"), value: format.number(health.checksThisMonth) },
    {
      label: t("estimateProviderCost"),
      value: format.number(health.providerCostCents / 100, { currency: "USD", style: "currency" }),
    },
  ];

  return (
    <>
      {metrics.map((metric) => (
        <div className="min-w-0" key={metric.label}>
          <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            {metric.label}
          </div>
          <div className="mt-[5px] flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{metric.value}</span>
          </div>
        </div>
      ))}
    </>
  );
}

export function DataSourcePanel({ checkHealth, health }: Readonly<DataSourcePanelProps>) {
  const t = useTranslations("projectDashboard.dataSource");
  const format = useFormatter();
  return (
    <Card className="px-5 py-4.5" size="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle>{t("title")}</SectionTitle>
          <span>{t("description")}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {checkHealth?.budget.exhausted ? (
            <span
              className="inline-flex flex-none items-center gap-[7px] rounded-full px-[11px] py-1.5 font-sans tabular-nums text-[11.5px] font-semibold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--yellow) 12%, transparent)",
                color: "var(--yellow-text)",
              }}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ backgroundColor: "var(--yellow)" }}
              />
              {t("budgetReached")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4.5 gap-y-3.5">
        <DataSourceMetrics health={health} />
        {checkHealth ? (
          <div className="min-w-0">
            <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              {t("failedChecks")}
            </div>
            <div className="mt-[5px] flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-fg">
                {format.number(checkHealth.failed24h.count)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
