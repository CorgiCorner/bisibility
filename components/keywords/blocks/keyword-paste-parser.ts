import { parseKeywordTargetLines } from "@/lib/keywords/add-keyword-drawer-shared";

export type KeywordPasteRow = {
  error: string | null;
  keyword: string;
  line: number;
  targetUrl: string | null;
};

export function parseKeywordPaste(value: string): KeywordPasteRow[] {
  const seen = new Set<string>();
  const sourceLineNumbers = value
    .split("\n")
    .flatMap((sourceLine, index) => (sourceLine.trim() ? [index + 1] : []));
  return parseKeywordTargetLines(value).map((entry, index) => {
    const key = entry.keyword.trim().toLocaleLowerCase("en-US");
    const duplicate = key !== "" && seen.has(key);
    if (key) seen.add(key);
    return {
      ...entry,
      error: entry.error ?? (duplicate ? "Duplicate keyword." : null),
      line: sourceLineNumbers[index] ?? index + 1,
    };
  });
}
