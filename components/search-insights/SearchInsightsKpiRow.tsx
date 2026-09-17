"use client";

import type {
  ClicksToSessionsKpi,
  SearchInsightsKpi,
} from "@/lib/search-insights/queries/kpis-model";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";
import { cn } from "@/lib/ui/cn";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/dist/csr/ArrowDownRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { useFormatter, useTranslations } from "next-intl";

export type SearchInsightsKpiRowProps = {
  /** Optional fifth card, so a second source can join the row without a second layout. */
  extra?: ClicksToSessionsKpi | OrganicSessionsPendingPresentation | null;
  kpis: readonly SearchInsightsKpi[];
};

// A flat window gets no arrow: pointing one anywhere would assert a direction the word denies.
const DELTA_ARROW = { down: ArrowDownRight, flat: null, up: ArrowUpRight } as const;

function KpiCard({ kpi }: Readonly<{ kpi: SearchInsightsKpi }>) {
  const format = useFormatter();
  const t = useTranslations("projectSearchInsights.copy");
  const up = kpi.dir === "up";
  const Arrow = DELTA_ARROW[kpi.dir];
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted">
          {metricLabel(kpi.metric, t)}
        </span>
        {/* Which system produced the number, on the number itself: two sources share this row. */}
        <span className="shrink-0 rounded-full bg-bg-sunken px-1.5 py-px font-sans tabular-nums text-ui-micro tracking-wide text-fg-muted">
          {t("sourceGsc")}
        </span>
      </span>
      <span className="font-sans tabular-nums text-ui-h1">{kpiValue(kpi, format)}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap font-sans tabular-nums text-ui-caption",
          // Improvement is the only thing that earns colour; everything else stays so a
          // normal week does not read as an alarm.
          up ? "text-green-text" : "text-fg-muted",
        )}
      >
        {Arrow ? <Arrow aria-hidden className="shrink-0" size={12} weight="regular" /> : null}
        {deltaLabel(kpi, format, t)}
      </span>
      <span className="whitespace-nowrap font-sans tabular-nums text-ui-micro text-fg-muted">
        {t("fromPrevious", {
          value: kpi.previous === null ? t("deltaNoData") : kpiValue(kpi, format, kpi.previous),
        })}
      </span>
    </div>
  );
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
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-sans tabular-nums text-ui-micro uppercase tracking-wide text-fg-muted">
          {t("ga4Sessions")}
        </span>
        <span className="shrink-0 rounded-full bg-bg-sunken px-1.5 py-px font-sans tabular-nums text-ui-micro tracking-wide text-fg-muted">
          {t("sourceGa4")}
        </span>
      </span>
      <span className="font-sans tabular-nums text-ui-h1">{t("pending")}</span>
      <span className="font-sans tabular-nums text-ui-caption text-fg-muted">
        {pendingStatus(pending.status, t)}
      </span>
      <span className="text-ui-micro text-fg-muted">{pendingReason(pending.reason, t)}</span>
      {pending.readyInMinutes ? (
        <span className="font-sans tabular-nums text-ui-micro text-fg-muted">
          {t("readyIn", { duration: pendingDuration(pending.readyInMinutes, t) })}
        </span>
      ) : null}
    </div>
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

export function SearchInsightsKpiRow({ extra, kpis }: Readonly<SearchInsightsKpiRowProps>) {
  const cards =
    extra?.kind === "visible"
      ? [...kpis, extra.kpi]
      : extra?.kind === "pending"
        ? [...kpis, extra]
        : [...kpis];
  return (
    <>
      <div
        className={cn(
          "grid grid-cols-2 gap-2.5",
          cards.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        {cards.map((kpi) =>
          "kind" in kpi ? (
            <PendingKpiCard key="pending-ga4-sessions" pending={kpi} />
          ) : (
            <KpiCard key={kpi.metric} kpi={kpi} />
          ),
        )}
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
