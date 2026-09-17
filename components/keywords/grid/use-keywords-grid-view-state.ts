import { getLocalizedKeywordFilterChips } from "@/components/keywords/filters/keyword-filter-presentation";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { MarketGridViewRow } from "@/lib/keywords/market-grid-model";
import { keywordSavedViewConfig } from "@/lib/keywords/saved-view-model";
import type { useTranslations } from "next-intl";
import { useMemo } from "react";
import { capturedKeywordFiltersSummary } from "./keyword-scope-summary";

type Input = {
  activeLens: ActiveLens;
  filters: KeywordFilters;
  locations: LensLocationOption[];
  rows: MarketGridViewRow[];
  searchValue: string;
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>;
};

export function useKeywordsGridViewState(input: Input) {
  const filterChips = useMemo(
    () => getLocalizedKeywordFilterChips(input.filters, input.t),
    [input.filters, input.t],
  );
  const targetRows = useMemo(
    () => input.rows.flatMap((row) => (row.kind === "group" ? (row.subRows ?? []) : [row])),
    [input.rows],
  );
  const capturedFilters = capturedKeywordFiltersSummary({
    filterChips,
    lens: input.activeLens,
    options: input.locations,
    search: input.searchValue.trim(),
    t: input.t,
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
