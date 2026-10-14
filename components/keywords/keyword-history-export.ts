import type { KeywordRow } from "@/lib/queries/keywords";
import { csvRow } from "@/lib/ui/csv";
import { downloadTextFile } from "@/lib/ui/download";

type HistoryKeyword = Pick<KeywordRow, "keyword" | "positionHistory" | "completedComparableChecks">;
type HistoryPoint = KeywordRow["positionHistory"][number] & { rankingUrl?: string | null };

function recordedRankingUrl(point: HistoryPoint, keyword: HistoryKeyword) {
  if (point.rankingUrl !== undefined) return point.rankingUrl;
  // Legacy summary points can use only an unambiguous matching recorded check.
  const checks = keyword.completedComparableChecks?.filter(
    (check) => check.checkedAt === point.checkedAt && check.position === point.position,
  );
  return checks?.length === 1 ? checks[0].rankingUrl : null;
}

export function keywordHistoryCsv(keyword: HistoryKeyword) {
  return [
    csvRow(["period", "keyword", "position", "ranking_url"]),
    ...keyword.positionHistory.map((point) =>
      csvRow([point.label, keyword.keyword, point.position, recordedRankingUrl(point, keyword)]),
    ),
  ].join("\n");
}

export function exportHistoryCsv(keyword: HistoryKeyword) {
  const slug = keyword.keyword
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  downloadTextFile(
    keywordHistoryCsv(keyword),
    `${slug || "keyword"}-history.csv`,
    "text/csv;charset=utf-8",
  );
}
