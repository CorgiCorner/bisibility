import type { KeywordRow } from "@/lib/queries/keywords";
import { downloadTextFile } from "@/lib/ui/download";

export function exportHistoryCsv(keyword: KeywordRow) {
  const rows = keyword.positionHistory.map(
    (point) => `${point.label},"${keyword.keyword}",${point.position},${keyword.rankingUrl ?? ""}`,
  );
  const csv = ["period,keyword,position,ranking_url", ...rows].join("\n");
  downloadTextFile(
    csv,
    `${keyword.keyword.replace(/\s+/g, "-")}-history.csv`,
    "text/csv;charset=utf-8",
  );
}
