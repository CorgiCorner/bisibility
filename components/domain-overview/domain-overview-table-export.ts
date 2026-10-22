import type { DomainOverviewScope } from "@/lib/domain-overview/types";
import type {
  DomainRankMetrics,
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import { csvRow } from "@/lib/ui/csv";
import { downloadTextFile } from "@/lib/ui/download";
import { historyDateKey } from "./domain-overview-metrics";

type CsvCell = number | string | null;

export type DomainOverviewSummaryExport = {
  countryCode?: string;
  fetchedAt: string;
  history: readonly HistoricalOverviewRow[] | null;
  languageCode: string;
  locationCode: number;
  overview: DomainRankMetrics;
  previousOverview: DomainRankMetrics | null;
  provider: string;
  scope: DomainOverviewScope;
  sourceSnapshotAt: string | null;
  target: string;
};

export function domainOverviewKeywordsCsv(rows: readonly RankedKeywordsPage["rows"][number][]) {
  return [
    csvRow([
      "keyword",
      "organic_position",
      "estimated_traffic",
      "search_volume",
      "difficulty",
      "cpc_cents",
      "intent",
      "ranking_url",
      "serp_absolute_delta",
    ]),
    ...rows.map((row) =>
      csvRow([
        row.keyword,
        row.position,
        row.estimatedTraffic,
        row.searchVolume,
        row.difficulty,
        row.cpcCents,
        row.intent,
        row.rankingUrl,
        row.rankAbsoluteDelta,
      ]),
    ),
  ].join("\n");
}

export function domainOverviewPagesCsv(rows: readonly RelevantPagesResult["rows"][number][]) {
  return [
    csvRow(["page", "estimated_traffic", "keywords"]),
    ...rows.map((row) => csvRow([row.path, row.etv, row.keywordCount])),
  ].join("\n");
}

export function downloadDomainOverviewKeywords(
  rows: readonly RankedKeywordsPage["rows"][number][],
) {
  downloadTextFile(
    domainOverviewKeywordsCsv(rows),
    "domain-overview-keywords.csv",
    "text/csv;charset=utf-8",
  );
}

export function downloadDomainOverviewPages(rows: readonly RelevantPagesResult["rows"][number][]) {
  downloadTextFile(
    domainOverviewPagesCsv(rows),
    "domain-overview-pages.csv",
    "text/csv;charset=utf-8",
  );
}

function fileToken(value: string) {
  const token = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token || "unknown";
}

function summaryFilename(target: string, scope: string, fetchedAt: string) {
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(fetchedAt)?.[1] ?? "undated";
  return `domain-overview-${fileToken(target)}-${fileToken(scope)}-${date}.csv`;
}

function scaledText(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const negative = numerator < 0 !== denominator < 0 && numerator !== 0;
  const scaled = Math.round((Math.abs(numerator) * 1_000_000) / Math.abs(denominator));
  const whole = Math.trunc(scaled / 1_000_000);
  const fraction = String(scaled % 1_000_000)
    .padStart(6, "0")
    .replace(/0+$/, "");
  const digits = fraction ? `${whole}.${fraction}` : String(whole);
  return negative ? `-${digits}` : digits;
}

function ratioCell(text: string): CsvCell {
  return text.startsWith("-") ? Number(text) : text;
}

function usd(cents: number) {
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(Math.trunc(cents));
  return sign * (Math.trunc(abs / 100) + (abs % 100) / 100);
}

function comparedRows(
  metric: string,
  current: number | null,
  previous: number | null | undefined,
  change: "absolute" | "ratio",
  unit: string,
) {
  const rows: CsvCell[][] = [["kpi", metric, "current", current, unit]];
  if (previous === undefined) return rows;
  rows.push(["kpi", metric, "previous", previous, unit]);
  if (current == null || previous == null) return rows;
  if (change === "absolute") {
    rows.push(["kpi", metric, "change", current - previous, unit]);
    return rows;
  }
  const text = scaledText(current - previous, previous);
  if (text != null) rows.push(["kpi", metric, "change", ratioCell(text), "ratio"]);
  return rows;
}

function distributionRows(metrics: DomainRankMetrics) {
  const buckets: [string, number][] = [
    ["pos_1", metrics.pos1],
    ["pos_2_3", metrics.pos2_3],
    ["pos_4_10", metrics.pos4_10],
    ["pos_11_20", metrics.pos11_20],
    ["pos_21_50", metrics.pos21_30 + metrics.pos31_40 + metrics.pos41_50],
    [
      "pos_51_100",
      metrics.pos51_60 + metrics.pos61_70 + metrics.pos71_80 + metrics.pos81_90 + metrics.pos91_100,
    ],
  ];
  const total = Math.max(0, metrics.count ?? buckets.reduce((sum, [, count]) => sum + count, 0));
  return buckets.flatMap(([metric, count]) => {
    const share = total > 0 ? scaledText(count, total) : null;
    const rows: CsvCell[][] = [["position_distribution", metric, "current", count, "keywords"]];
    if (share != null) {
      rows.push(["position_distribution", metric, "share", ratioCell(share), "ratio"]);
    }
    return rows;
  });
}

function historyValue(row: HistoricalOverviewRow, metric: string): CsvCell {
  if (metric === "keywords") return row.metrics.count;
  if (metric === "top_10") return row.metrics.pos1 + row.metrics.pos2_3 + row.metrics.pos4_10;
  if (metric === "value") {
    return row.metrics.estimatedTrafficCostCents == null
      ? null
      : usd(row.metrics.estimatedTrafficCostCents);
  }
  return row.metrics.etv;
}

function historyUnit(metric: string) {
  if (metric === "traffic") return "etv";
  if (metric === "value") return "usd";
  return "keywords";
}

export function domainOverviewSummaryCsv(input: DomainOverviewSummaryExport) {
  const metrics = input.overview;
  const previous = input.previousOverview;
  const country = input.countryCode?.trim() ? input.countryCode.trim() : String(input.locationCode);
  const rows: CsvCell[][] = [
    ["section", "metric", "period", "value", "unit"],
    ["context", "target", "", input.target, ""],
    ["context", "scope", "", input.scope, ""],
    ["context", "country", "", country, ""],
    ["context", "language", "", input.languageCode, ""],
    ["context", "provider", "", input.provider, ""],
    ["context", "fetched_at", "", input.fetchedAt, ""],
    ["context", "source_snapshot_at", "", input.sourceSnapshotAt, ""],
    ...comparedRows(
      "estimated_traffic",
      metrics.etv,
      previous ? previous.etv : undefined,
      "ratio",
      "etv",
    ),
    ...comparedRows(
      "organic_keywords",
      metrics.count,
      previous ? previous.count : undefined,
      "absolute",
      "keywords",
    ),
    ...comparedRows(
      "top_10",
      metrics.pos1 + metrics.pos2_3 + metrics.pos4_10,
      previous ? previous.pos1 + previous.pos2_3 + previous.pos4_10 : undefined,
      "absolute",
      "keywords",
    ),
    ...comparedRows(
      "estimated_value",
      metrics.estimatedTrafficCostCents == null ? null : usd(metrics.estimatedTrafficCostCents),
      previous
        ? previous.estimatedTrafficCostCents == null
          ? null
          : usd(previous.estimatedTrafficCostCents)
        : undefined,
      "ratio",
      "usd",
    ),
    ...comparedRows(
      "position_1",
      metrics.pos1,
      previous ? previous.pos1 : undefined,
      "absolute",
      "keywords",
    ),
    ["kpi", "new_keywords", "current", metrics.isNew, "keywords"],
    ["kpi", "lost_keywords", "current", metrics.isLost, "keywords"],
    ...distributionRows(metrics),
    ["what_changed", "new", "current", metrics.isNew, "keywords"],
    ["what_changed", "lost", "current", metrics.isLost, "keywords"],
    ["what_changed", "up", "current", metrics.isUp, "keywords"],
    ["what_changed", "down", "current", metrics.isDown, "keywords"],
  ];
  if (input.history) {
    const months = [...input.history].sort((a, b) => a.year - b.year || a.month - b.month);
    for (const row of months) {
      for (const metric of ["traffic", "keywords", "top_10", "value"]) {
        rows.push([
          "history",
          metric,
          historyDateKey(row),
          historyValue(row, metric),
          historyUnit(metric),
        ]);
      }
    }
  }
  return rows.map((row) => csvRow(row)).join("\n");
}

export function downloadDomainOverviewSummary(input: DomainOverviewSummaryExport) {
  downloadTextFile(
    domainOverviewSummaryCsv(input),
    summaryFilename(input.target, input.scope, input.fetchedAt),
    "text/csv;charset=utf-8",
  );
}
