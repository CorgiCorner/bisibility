"use client";

import { StatTile } from "@/components/ui/StatTile";
import type {
  ClicksToSessionsKpi,
  SearchInsightsKpi,
} from "@/lib/search-insights/queries/kpis-model";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";

export type ConversionsKpiSlot =
  | { href: string; kind: "connect" }
  | { kind: "value"; kpi: SearchInsightsKpi };

export type SearchInsightsKpiRowProps = {
  /** Conversions for the same period, or a connect card when no source is connected. */
  conversions?: ConversionsKpiSlot | null;
  /** Optional fifth card, so a second source can join the row without a second layout. */
  extra?: ClicksToSessionsKpi | OrganicSessionsPendingPresentation | null;
  kpis: readonly SearchInsightsKpi[];
};

function KpiCard({ kpi }: Readonly<{ kpi: SearchInsightsKpi }>) {
  const format = useFormatter();
  const t = useTranslations("projectSearchInsights.copy");
  return (
    <StatTile
      caption={t("fromPrevious", {
        value: kpi.previous === null ? t("deltaNoData") : kpiValue(kpi, format, kpi.previous),
      })}
      delta={{ direction: kpi.dir, label: deltaLabel(kpi, format, t) }}
      label={metricLabel(kpi.metric, t)}
      source={sourceChip(kpi, t)}
      value={kpiValue(kpi, format)}
    />
  );
}

function sourceChip(
  kpi: SearchInsightsKpi,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  if (kpi.metric !== "conversions") return t("sourceGsc");
  const source = kpi.source === "plausible" ? t("sourcePlausible") : t("sourceGa4");
  return (kpi.goalCount ?? 0) > 0
    ? t("conversionSourceGoals", { count: kpi.goalCount ?? 0, source })
    : source;
}

function metricLabel(
  metric: SearchInsightsKpi["metric"],
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  switch (metric) {
    case "clicks":
      return t("metricClicks");
    case "impressions":
      return t("metricImpressions");
    case "ctr":
      return t("metricCtr");
    case "position":
      return t("metricPosition");
    case "clicks_to_sessions":
      return t("metricClicksToSessions");
    case "conversions":
      return t("metricConversions");
  }
}

function kpiValue(
  kpi: SearchInsightsKpi,
  format: ReturnType<typeof useFormatter>,
  value = kpi.value,
) {
  if (kpi.valueKind === "count") return format.number(value, { maximumFractionDigits: 0 });
  if (kpi.valueKind === "position") {
    return format.number(value, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  return format.number(value, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "percent",
  });
}

function deltaLabel(
  kpi: SearchInsightsKpi,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  const { delta } = kpi;
  switch (delta.kind) {
    case "new":
      return t("deltaNew");
    case "no_data":
      return t("deltaNoData");
    case "unchanged":
      return t("deltaUnchanged");
  }
  if (delta.unit === "percent_change") {
    return format.number(delta.value, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
      signDisplay: "always",
      style: "percent",
    });
  }
  if (delta.unit === "percentage_points") {
    return t("deltaPercentagePoints", {
      value: format.number(delta.value * 100, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        signDisplay: "always",
      }),
    });
  }
  return kpi.dir === "up"
    ? t("deltaPositionBetter", { value: format.number(delta.value, { maximumFractionDigits: 1 }) })
    : t("deltaPositionWorse", { value: format.number(delta.value, { maximumFractionDigits: 1 }) });
}

function PendingKpiCard({ pending }: Readonly<{ pending: OrganicSessionsPendingPresentation }>) {
  const t = useTranslations("projectSearchInsights.copy");
  return (
    <StatTile
      caption={
        <>
          <span className="block">{pendingStatus(pending.status, t)}</span>
          <span className="block">{pendingReason(pending.reason, t)}</span>
          {pending.readyInMinutes ? (
            <span className="block">
              {t("readyIn", { duration: pendingDuration(pending.readyInMinutes, t) })}
            </span>
          ) : null}
        </>
      }
      label={t("ga4Sessions")}
      source={t("sourceGa4")}
      value={t("pending")}
    />
  );
}

function pendingStatus(
  status: OrganicSessionsPendingPresentation["status"],
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  switch (status) {
    case "complete":
      return t("pendingStatusComplete");
    case "needs_reauth":
      return t("pendingStatusNeedsReauth");
    case "needs_retry":
      return t("pendingStatusNeedsRetry");
    case "paused_by_provider":
      return t("pendingStatusPausedByProvider");
    case "paused_by_user":
      return t("pendingStatusPausedByUser");
    case "queued":
      return t("pendingStatusQueued");
    case "running":
      return t("pendingStatusRunning");
    case "waiting_for_today":
      return t("pendingStatusWaitingForToday");
    case "waiting_on_worker":
      return t("pendingStatusWaitingOnWorker");
  }
}

function pendingReason(
  reason: OrganicSessionsPendingPresentation["reason"],
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  switch (reason) {
    case "history_not_covered":
      return t("pendingReasonHistoryNotCovered");
    case "needs_reauth":
      return t("pendingReasonNeedsReauth");
    case "needs_retry":
      return t("pendingReasonNeedsRetry");
    case "paused_by_provider":
      return t("pendingReasonPausedByProvider");
    case "paused_by_user":
      return t("pendingReasonPausedByUser");
    case "queued":
      return t("pendingReasonQueued");
    case "running":
      return t("pendingReasonRunning");
    case "waiting_for_today":
      return t("pendingReasonWaitingForToday");
    case "waiting_on_worker":
      return t("pendingReasonWaitingOnWorker");
  }
}

function pendingDuration(
  minutes: number,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  return minutes < 60
    ? t("pendingDurationMinutes", { minutes })
    : t("pendingDurationHours", { hours: Math.ceil(minutes / 60) });
}

function ConversionsConnectCard({ href }: Readonly<{ href: string }>) {
  const t = useTranslations("projectSearchInsights.copy");
  return (
    <StatTile
      label={t("metricConversions")}
      value={t("conversionsConnect")}
      valueNode={
        <a
          className="font-sans text-ui-caption text-accent-text no-underline hover:underline"
          href={href}
        >
          {t("conversionsConnect")}
        </a>
      }
    />
  );
}

export function SearchInsightsKpiRow({
  conversions = null,
  extra,
  kpis,
}: Readonly<SearchInsightsKpiRowProps>) {
  const cards =
    extra?.kind === "visible"
      ? [...kpis, extra.kpi]
      : extra?.kind === "pending"
        ? [...kpis, extra]
        : [...kpis];
  const withConversions = conversions?.kind === "value" ? [...cards, conversions.kpi] : cards;
  return (
    <>
      <div
        className={cn(
          "grid grid-cols-2 gap-2.5",
          withConversions.length + (conversions?.kind === "connect" ? 1 : 0) > 4
            ? "md:grid-cols-3"
            : "lg:grid-cols-4",
        )}
      >
        {withConversions.map((kpi) =>
          "kind" in kpi ? (
            <PendingKpiCard key="pending-ga4-sessions" pending={kpi} />
          ) : (
            <KpiCard key={kpi.metric} kpi={kpi} />
          ),
        )}
        {conversions?.kind === "connect" ? (
          <ConversionsConnectCard href={conversions.href} />
        ) : null}
      </div>
      {extra?.kind === "hidden" ? (
        <p className="m-0 px-0.5 text-ui-caption text-fg-muted">
          <HiddenClicksToSessionsReason />
        </p>
      ) : null}
    </>
  );
}

function HiddenClicksToSessionsReason() {
  const t = useTranslations("projectSearchInsights.copy");
  return t("clicksToSessionsHidden");
}
