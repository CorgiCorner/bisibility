import { CsvParseError, parseKeywordImportCsvRows } from "@/lib/keywords/import-csv-parser";
import { addKeywordSchema } from "@/lib/schemas/keyword";
import { z } from "zod";

export type AddKeywordTab = "api" | "csv" | "manual";

export const ADD_KEYWORD_TABS: { id: AddKeywordTab; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "csv", label: "CSV" },
  { id: "api", label: "API" },
];

export const addKeywordDrawerSchema = addKeywordSchema.omit({ keyword: true }).extend({
  isPaused: z.coerce.boolean().default(false),
  keywords: z.string().trim().min(1, "Add at least one keyword."),
});

export type AddKeywordDrawerForm = z.infer<typeof addKeywordDrawerSchema>;

export const fieldClass =
  "min-h-10 w-full rounded-[9px] border border-border-strong bg-bg-sunken px-3 text-[13px] font-medium text-fg outline-none focus:border-accent";

export function parseKeywordLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type ParsedKeywordTarget = {
  error: string | null;
  keyword: string;
  targetUrl: string | null;
};

function isValidTargetUrl(value: string): boolean {
  return value.startsWith("/") ? !value.startsWith("//") : URL.canParse(value);
}

/**
 * Per-line target URLs override the batch pin; invalid URLs remain attached to their entry.
 */
export function parseKeywordTargetLines(value: string): ParsedKeywordTarget[] {
  const entries: ParsedKeywordTarget[] = [];
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const pipe = line.indexOf("|");
    if (pipe === -1) {
      entries.push({ error: null, keyword: line, targetUrl: null });
      continue;
    }
    const keyword = line.slice(0, pipe).trim();
    const url = line.slice(pipe + 1).trim();
    if (!keyword) {
      entries.push({
        error: "Add a keyword before the | target URL.",
        keyword: "",
        targetUrl: null,
      });
      continue;
    }
    if (!url) {
      entries.push({ error: null, keyword, targetUrl: null });
      continue;
    }
    if (!isValidTargetUrl(url)) {
      entries.push({ error: `"${url}" is not a valid URL or path.`, keyword, targetUrl: null });
      continue;
    }
    entries.push({ error: null, keyword, targetUrl: url });
  }
  return entries;
}

export function keywordTargetLineError(entries: readonly ParsedKeywordTarget[]): string | null {
  return entries.find((entry) => entry.error)?.error ?? null;
}

export function hasPerLineTarget(entries: readonly ParsedKeywordTarget[]): boolean {
  return entries.some((entry) => entry.targetUrl !== null);
}

export function parseCsvKeywords(value: string) {
  const result = parseCsvKeywordsResult(value);
  return result.error ? [result.error] : result.keywords;
}

export function parseCsvKeywordsResult(value: string) {
  try {
    const rows = parseKeywordImportCsvRows(value);
    return { error: null, keywords: rows.map((row) => row.keyword).filter(Boolean), rows };
  } catch (error) {
    if (error instanceof CsvParseError) return { error: error.message, keywords: [], rows: [] };
    throw error;
  }
}
