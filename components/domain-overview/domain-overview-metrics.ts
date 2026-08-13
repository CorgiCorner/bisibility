import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import type { DomainRankMetrics, HistoricalOverviewRow } from "@/lib/providers/types";

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" });
const exactEstimate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});
const shortDate = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export type DomainOverviewKpi = {
  delta: string;
  deltaTone: "negative" | "neutral" | "positive";
  label: string;
  value: string;
};

export function formatDomainCount(value: number) {
  return count.format(value);
}

export function formatDomainEstimate(value: number) {
  return compact.format(value);
}

export function formatDomainEstimateExact(value: number) {
  return exactEstimate.format(value);
}

const kpiLabels = {
  estimatedTraffic: "Est. traffic",
  estimatedValue: "Est. value",
  newKeywords: "New keywords",
  organicKeywords: "Organic keywords",
  positionOne: "Position #1",
  topTen: "Top 10",
} as const;

export function emptyDomainOverviewKpis(): DomainOverviewKpi[] {
  return [
    kpiLabels.estimatedTraffic,
    kpiLabels.organicKeywords,
    kpiLabels.topTen,
    kpiLabels.estimatedValue,
    kpiLabels.positionOne,
    kpiLabels.newKeywords,
  ].map((label) => ({ delta: "No data", deltaTone: "neutral", label, value: "-" }));
}

function topTen(metrics: DomainRankMetrics) {
  return metrics.pos1 + metrics.pos2_3 + metrics.pos4_10;
}

function signed(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : "−"}${count.format(Math.abs(value))}${suffix}`;
}

function absoluteDelta(
  current: number | null,
  previous: number | null,
): Pick<DomainOverviewKpi, "delta" | "deltaTone"> {
  if (current == null || previous == null) return { delta: "", deltaTone: "neutral" as const };
  const delta = current - previous;
  return {
    delta: signed(delta),
    deltaTone: delta > 0 ? ("positive" as const) : delta < 0 ? ("negative" as const) : "neutral",
  };
}

function percentDelta(
  current: number | null,
  previous: number | null,
): Pick<DomainOverviewKpi, "delta" | "deltaTone"> {
  if (current == null || previous == null || previous === 0) {
    return { delta: "", deltaTone: "neutral" as const };
  }
  const delta = ((current - previous) / previous) * 100;
  return {
    delta: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(1)}%`,
    deltaTone: delta > 0 ? ("positive" as const) : delta < 0 ? ("negative" as const) : "neutral",
  };
}

export function domainOverviewKpis(
  metrics: DomainRankMetrics,
  previous: DomainRankMetrics | null,
): DomainOverviewKpi[] {
  const previousTopTen = previous ? topTen(previous) : null;
  return [
    {
      label: kpiLabels.estimatedTraffic,
      value: metrics.etv == null ? "-" : formatDomainEstimate(metrics.etv),
      ...percentDelta(metrics.etv, previous?.etv ?? null),
    },
    {
      label: kpiLabels.organicKeywords,
      value: metrics.count == null ? "-" : count.format(metrics.count),
      ...absoluteDelta(metrics.count, previous?.count ?? null),
    },
    {
      label: kpiLabels.topTen,
      value: count.format(topTen(metrics)),
      ...absoluteDelta(topTen(metrics), previousTopTen),
    },
    {
      label: kpiLabels.estimatedValue,
      value:
        metrics.estimatedTrafficCostCents == null
          ? "-"
          : currency.format(metrics.estimatedTrafficCostCents / 100),
      ...percentDelta(
        metrics.estimatedTrafficCostCents,
        previous?.estimatedTrafficCostCents ?? null,
      ),
    },
    {
      label: kpiLabels.positionOne,
      value: count.format(metrics.pos1),
      ...absoluteDelta(metrics.pos1, previous?.pos1 ?? null),
    },
    {
      delta: metrics.isLost > 0 ? `−${count.format(metrics.isLost)} lost` : "",
      deltaTone: "neutral",
      label: kpiLabels.newKeywords,
      value: count.format(metrics.isNew),
    },
  ];
}

export type PositionBucket = { count: number; label: string; value: string };

export function positionBuckets(metrics: DomainRankMetrics): PositionBucket[] {
  return [
    { count: metrics.pos1, label: "#1", value: "1" },
    { count: metrics.pos2_3, label: "2 - 3", value: "2-3" },
    { count: metrics.pos4_10, label: "4 - 10", value: "4-10" },
    { count: metrics.pos11_20, label: "11 - 20", value: "11-20" },
    {
      count: metrics.pos21_30 + metrics.pos31_40 + metrics.pos41_50,
      label: "21 - 50",
      value: "21-50",
    },
    {
      count:
        metrics.pos51_60 +
        metrics.pos61_70 +
        metrics.pos71_80 +
        metrics.pos81_90 +
        metrics.pos91_100,
      label: "51 - 100",
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

export function historyLabel(row: Pick<HistoricalOverviewRow, "month" | "year">) {
  return monthDate.format(new Date(Date.UTC(row.year, row.month - 1, 1)));
}

export function sourceDateLabel(value: string | null) {
  return value ? shortDate.format(new Date(value)) : "unknown";
}

export function scopeLabel(scope: DomainOverviewScope) {
  return scope === "subdomain" ? "Subdomain" : "Whole domain";
}
