import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { downloadTextFile } from "@/lib/ui/download";

function csvCell(value: number | string | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: (number | string | null)[]) {
  return values.map(csvCell).join(",");
}

export function savedKeywordsCsv(rows: readonly SavedKeywordRow[]) {
  return [
    csvRow(["keyword", "volume", "kd", "cpc", "intent", "source_seed", "location", "saved_at"]),
    ...rows.map((row) =>
      csvRow([
        row.text,
        row.volume,
        row.difficulty,
        row.cpc,
        row.intent,
        row.sourceSeed,
        row.location,
        row.savedAt,
      ]),
    ),
  ].join("\n");
}

export function downloadSavedKeywordsCsv(rows: readonly SavedKeywordRow[]) {
  downloadTextFile(savedKeywordsCsv(rows), "saved-keywords.csv", "text/csv;charset=utf-8");
}
