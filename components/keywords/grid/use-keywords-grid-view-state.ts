import {
  applyKeywordFilters,
  getFilterChips,
  type KeywordFilters,
  matchesKeywordSearch,
} from "@/lib/keywords/keyword-filter-model";
import { applyLens, DEFAULT_LENS_DEVICE, lensLocationOptions } from "@/lib/keywords/lens-model";
import {
  cloneSavedViewConfig,
  emptySavedViewConfig,
  keywordSavedViewConfig,
  type SavedViewConfig,
} from "@/lib/keywords/saved-view-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useMemo } from "react";
import { capturedKeywordFiltersSummary } from "./keyword-scope-summary";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Input = {
  activeLens: KeywordsGridProps["lens"];
  filters: KeywordFilters;
  flatServer: boolean;
  initialViewConfig?: SavedViewConfig;
  locations: KeywordsGridProps["locations"];
  rows: KeywordRow[];
  searchValue: string;
};

export function useKeywordsGridViewState(input: Input) {
  const activeLens = input.activeLens ?? { device: DEFAULT_LENS_DEVICE, locationId: null };
  const viewConfig = cloneSavedViewConfig(input.initialViewConfig ?? emptySavedViewConfig);
  const locationOptions = useMemo(
    () => input.locations ?? lensLocationOptions(input.rows),
    [input.locations, input.rows],
  );
  const lensRows = useMemo(
    () => (input.flatServer ? input.rows : applyLens(input.rows, activeLens)),
    [activeLens, input.flatServer, input.rows],
  );
  const filterChips = useMemo(() => getFilterChips(input.filters), [input.filters]);
  const filteredRows = useMemo(
    () =>
      input.flatServer
        ? lensRows
        : applyKeywordFilters(lensRows, input.filters).filter((row) =>
            matchesKeywordSearch(row, input.searchValue),
          ),
    [input.filters, input.flatServer, input.searchValue, lensRows],
  );
  const capturedFilters = capturedKeywordFiltersSummary({
    filterChips,
    lens: activeLens,
    options: locationOptions,
    search: input.searchValue.trim(),
  });
  const currentViewConfig = useMemo(
    () =>
      keywordSavedViewConfig({
        filters: input.filters,
        lens: activeLens,
        search: input.searchValue.trim(),
      }),
    [activeLens, input.filters, input.searchValue],
  );
  return {
    activeLens,
    capturedFilters,
    currentViewConfig,
    filterChips,
    filteredRows,
    lensRows,
    locationOptions,
    viewConfig,
  };
}
