import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import type { DomainRankMetrics, HistoricalOverviewRow } from "@/lib/providers/types";
import type { useTranslations } from "next-intl";

export type DomainOverviewTranslations = ReturnType<
  typeof useTranslations<"projectDomainOverview.workspace.ui">
>;

export type DomainOverviewKpi = {
  delta: string;
  deltaTone: "negative" | "neutral" | "positive";
  label: string;
  value: string;
};

export function formatDomainCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatDomainEstimate(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" }).format(
    value,
  );
}

export function formatDomainEstimateExact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
}

export function formatDomainCost(cents: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, {
    currency: "USD",
    minimumFractionDigits: 2,
    style: "currency",
  });
  return formatter.format(Math.abs(cents) / 100);
}

export function formatDomainEstimatedCost(
  cents: number,
  locale: string,
  t: DomainOverviewTranslations,
) {
  const amount = formatDomainCost(cents === 0 ? 0 : Math.max(1, Math.abs(cents)), locale);
  return Math.abs(cents) > 0 && Math.abs(cents) < 1
    ? t("lessThanCost", { amount })
    : t("estimatedCost", { amount });
}

export function relativePastLabel(date: Date, now: Date, t: DomainOverviewTranslations) {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("yesterday") : t("daysAgo", { count: days });
}

const kpiKeys = [
  "kpiEstimatedTraffic",
  "kpiOrganicKeywords",
  "kpiTopTen",
  "kpiEstimatedValue",
  "kpiPositionOne",
  "kpiNewKeywords",
] as const;

export function emptyDomainOverviewKpis(t: DomainOverviewTranslations): DomainOverviewKpi[] {
  return kpiKeys.map((key) => ({
    delta: t("noData"),
    deltaTone: "neutral",
    label: t(key),
    value: "-",
  }));
}

function topTen(metrics: DomainRankMetrics) {
  return metrics.pos1 + metrics.pos2_3 + metrics.pos4_10;
}

function signed(value: number, locale: string) {
  if (value === 0) return formatDomainCount(0, locale);
  return `${value > 0 ? "+" : "−"}${formatDomainCount(Math.abs(value), locale)}`;
}

function absoluteDelta(
  current: number | null,
  previous: number | null,
  locale: string,
): Pick<DomainOverviewKpi, "delta" | "deltaTone"> {
  if (current == null || previous == null) return { delta: "", deltaTone: "neutral" as const };
  const delta = current - previous;
  return {
    delta: signed(delta, locale),
    deltaTone: delta > 0 ? ("positive" as const) : delta < 0 ? ("negative" as const) : "neutral",
  };
}

function percentDelta(
  current: number | null,
  previous: number | null,
  locale: string,
): Pick<DomainOverviewKpi, "delta" | "deltaTone"> {
  if (current == null || previous == null || previous === 0) {
    return { delta: "", deltaTone: "neutral" as const };
  }
  const delta = (current - previous) / previous;
  return {
    delta: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
      style: "percent",
    }).format(Math.abs(delta))}`,
    deltaTone: delta > 0 ? ("positive" as const) : delta < 0 ? ("negative" as const) : "neutral",
  };
}

export function domainOverviewKpis(
  metrics: DomainRankMetrics,
  previous: DomainRankMetrics | null,
  locale: string,
  t: DomainOverviewTranslations,
): DomainOverviewKpi[] {
  const previousTopTen = previous ? topTen(previous) : null;
  return [
    {
      label: t("kpiEstimatedTraffic"),
      value: metrics.etv == null ? "-" : formatDomainEstimate(metrics.etv, locale),
      ...percentDelta(metrics.etv, previous?.etv ?? null, locale),
    },
    {
      label: t("kpiOrganicKeywords"),
      value: metrics.count == null ? "-" : formatDomainCount(metrics.count, locale),
      ...absoluteDelta(metrics.count, previous?.count ?? null, locale),
    },
    {
      label: t("kpiTopTen"),
      value: formatDomainCount(topTen(metrics), locale),
      ...absoluteDelta(topTen(metrics), previousTopTen, locale),
    },
    {
      label: t("kpiEstimatedValue"),
      value:
        metrics.estimatedTrafficCostCents == null
          ? "-"
          : new Intl.NumberFormat(locale, {
              currency: "USD",
              maximumFractionDigits: 1,
              notation: "compact",
              style: "currency",
            }).format(metrics.estimatedTrafficCostCents / 100),
      ...percentDelta(
        metrics.estimatedTrafficCostCents,
        previous?.estimatedTrafficCostCents ?? null,
        locale,
      ),
    },
    {
      label: t("kpiPositionOne"),
      value: formatDomainCount(metrics.pos1, locale),
      ...absoluteDelta(metrics.pos1, previous?.pos1 ?? null, locale),
    },
    {
      delta: metrics.isLost > 0 ? t("lostCount", { count: metrics.isLost }) : "",
      deltaTone: "neutral",
      label: t("kpiNewKeywords"),
      value: formatDomainCount(metrics.isNew, locale),
    },
  ];
}

export type PositionBucket = { count: number; label: string; value: string };

export function positionBuckets(
  metrics: DomainRankMetrics,
  t: DomainOverviewTranslations,
): PositionBucket[] {
  return [
    { count: metrics.pos1, label: t("positionBucket", { position: 1 }), value: "1" },
    { count: metrics.pos2_3, label: t("positionRange", { from: 2, to: 3 }), value: "2-3" },
    { count: metrics.pos4_10, label: t("positionRange", { from: 4, to: 10 }), value: "4-10" },
    { count: metrics.pos11_20, label: t("positionRange", { from: 11, to: 20 }), value: "11-20" },
    {
      count: metrics.pos21_30 + metrics.pos31_40 + metrics.pos41_50,
      label: t("positionRange", { from: 21, to: 50 }),
      value: "21-50",
    },
    {
      count:
        metrics.pos51_60 +
        metrics.pos61_70 +
        metrics.pos71_80 +
        metrics.pos81_90 +
        metrics.pos91_100,
      label: t("positionRange", { from: 51, to: 100 }),
      value: "51-100",
    },
  ];
}

export type HistoryMetric = "keywords" | "top10" | "traffic" | "value";

export function historyMetricValue(row: HistoricalOverviewRow, metric: HistoryMetric) {
  if (metric === "keywords") return row.metrics.count ?? 0;
  if (metric === "top10") return topTen(row.metrics);
  if (metric === "value") return (row.metrics.estimatedTrafficCostCents ?? 0) / 100;
  return row.metrics.etv ?? 0;
}

export function historyLabel(row: Pick<HistoricalOverviewRow, "month" | "year">, locale = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(row.year, row.month - 1, 1)));
}

/** Machine-safe first day of a provider's calendar month for the client display boundary. */
export function historyDateKey(row: Pick<HistoricalOverviewRow, "month" | "year">) {
  return `${row.year}-${String(row.month).padStart(2, "0")}-01`;
}

export function sourceDateLabel(
  value: string | null,
  dateFormat: DateFormat = "month_first",
  t: DomainOverviewTranslations,
) {
  if (!value) return t("unknown");
  const key = value.slice(0, 10);
  return formatDateRange(key, key, dateFormat);
}

export function scopeLabel(scope: DomainOverviewScope, t: DomainOverviewTranslations) {
  return scope === "subdomain" ? t("subdomain") : t("wholeDomain");
}
