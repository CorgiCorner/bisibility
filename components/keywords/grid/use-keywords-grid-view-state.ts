import { getFilterChips, type KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { MarketGridViewRow } from "@/lib/keywords/market-grid-model";
import { keywordSavedViewConfig } from "@/lib/keywords/saved-view-model";
import { useMemo } from "react";
import { capturedKeywordFiltersSummary } from "./keyword-scope-summary";

type Input = {
  activeLens: ActiveLens;
  filters: KeywordFilters;
  locations: LensLocationOption[];
  rows: MarketGridViewRow[];
  searchValue: string;
};

export function useKeywordsGridViewState(input: Input) {
  const filterChips = useMemo(() => getFilterChips(input.filters), [input.filters]);
  const targetRows = useMemo(
    () => input.rows.flatMap((row) => (row.kind === "group" ? (row.subRows ?? []) : [row])),
    [input.rows],
  );
  const capturedFilters = capturedKeywordFiltersSummary({
    filterChips,
    lens: input.activeLens,
    options: input.locations,
    search: input.searchValue.trim(),
  });
  const currentViewConfig = useMemo(
    () =>
      keywordSavedViewConfig({
        filters: input.filters,
        lens: input.activeLens,
        search: input.searchValue.trim(),
      }),
    [input.activeLens, input.filters, input.searchValue],
  );
  return { capturedFilters, currentViewConfig, filterChips, targetRows };
}
