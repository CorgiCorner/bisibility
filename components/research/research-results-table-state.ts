import { type GroupedResearchRow, normalizeResearchVariant } from "@/lib/keyword-research/grouping";

export const RESEARCH_RESULTS_TABLE_ID = "research-results-table";
export const RESEARCH_RESULTS_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const RESEARCH_RESULTS_DEFAULT_PAGE_SIZE = 50;

export type ResearchResultsTableRow = GroupedResearchRow & { id: string };

export function researchResultsRowId(row: GroupedResearchRow) {
  return `research:${encodeURIComponent(normalizeResearchVariant(row.keyword))}`;
}

export function researchResultsTableRows(
  rows: readonly GroupedResearchRow[],
): ResearchResultsTableRow[] {
  return rows.map((row) => ({ ...row, id: researchResultsRowId(row) }));
}

export function researchResultsSelectionIds(
  rows: readonly ResearchResultsTableRow[],
  selectedKeywords: readonly string[],
): ReadonlySet<string> {
  const selected = new Set(selectedKeywords);
  return new Set(rows.flatMap((row) => (selected.has(row.keyword) ? [row.id] : [])));
}

export function researchResultsSelectedKeywords(
  rows: readonly ResearchResultsTableRow[],
  selection: ReadonlySet<string>,
  previousKeywords: readonly string[],
): string[] {
  const visibleKeywords = new Set(rows.map((row) => row.keyword));
  const next = new Set(previousKeywords.filter((keyword) => !visibleKeywords.has(keyword)));
  for (const row of rows) {
    if (selection.has(row.id)) next.add(row.keyword);
  }
  return [...next];
}
