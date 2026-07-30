import { downloadTextFile } from "@/lib/ui/download";
import type { CompetitorMarket } from "./types";

function csvCell(value: number | string | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: (number | string | null)[]) {
  return values.map(csvCell).join(",");
}

export function competitorMarketCsv(market: CompetitorMarket) {
  const rows = [
    csvRow(["section", "market_location", "market_device", "market_engine"]),
    csvRow(["market", market.location, market.device, market.engine]),
    "",
    csvRow(["section", "domain", "shared_keywords", "share_of_voice"]),
    ...market.shares.map((share) =>
      csvRow(["share_of_voice", share.domain, share.sharedKeywords, share.shareOfVoice]),
    ),
    "",
    csvRow(["keyword", ...market.columns.map((column) => column.domain), "gap"]),
    ...market.rows.map((row) =>
      csvRow([
        row.keyword,
        ...market.columns.map((column) => row.ranks[column.domain] ?? null),
        row.gap,
      ]),
    ),
  ];
  return `${rows.join("\n")}\n`;
}

export function competitorDownloadName(market: CompetitorMarket) {
  const slug = [market.location, market.device, market.engine]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `competitors-${slug}.csv`;
}

export function downloadCompetitorMarketCsv(market: CompetitorMarket) {
  downloadTextFile(
    competitorMarketCsv(market),
    competitorDownloadName(market),
    "text/csv;charset=utf-8",
  );
}
