import type { KeywordResearchRow } from "@/lib/keyword-research/types";
import type { ResearchScope } from "@/lib/research/scope";

export function researchScopeMetricsAvailable(scope: ResearchScope) {
  return scope.researchAvailable;
}

export function rowsForResearchScope(
  rows: readonly KeywordResearchRow[],
  metricsAvailable: boolean,
): KeywordResearchRow[] {
  if (metricsAvailable) return [...rows];
  return rows.map((row) => ({
    ...row,
    competition: null,
    cpcCents: null,
    difficulty: null,
    monthlyTrend: [],
    searchVolume: null,
  }));
}
