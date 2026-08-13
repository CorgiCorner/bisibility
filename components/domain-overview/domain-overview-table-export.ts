import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import { downloadTextFile } from "@/lib/ui/download";

function csvCell(value: number | string | null) {
  const raw = value === null ? "" : String(value);
  const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: readonly (number | string | null)[]) {
  return values.map(csvCell).join(",");
}

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
    csvRow([
      "page",
      "estimated_traffic",
      "keywords",
      "top_keyword",
      "organic_position",
      "traffic_delta_pct",
    ]),
    ...rows.map((row) =>
      csvRow([
        row.path,
        row.etv,
        row.keywordCount,
        row.topKeyword,
        row.topKeywordPosition,
        row.etvDeltaPct,
      ]),
    ),
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
