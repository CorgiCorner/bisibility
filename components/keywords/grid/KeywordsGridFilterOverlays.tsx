"use client";

import {
  KeywordsScopeControls,
  KeywordsScopeLocationChip,
} from "@/components/keywords/KeywordsScopeControls";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type {
  RankTrackerListFacets,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { FiltersDrawer } from "./KeywordsGridOverlays";

type ScopeProps = {
  activeViewId: string | null;
  keywordsPath: string;
  lens: ActiveLens;
  locationOptions: LensLocationOption[];
  query?: RankTrackerQueryState;
};

export function KeywordsGridScopeChip({
  activeViewId,
  keywordsPath,
  lens,
  locationOptions,
  query,
}: Readonly<ScopeProps>) {
  return lens.locationId ? (
    <KeywordsScopeLocationChip
      basePath={keywordsPath}
      lens={lens}
      locationOptions={locationOptions}
      viewId={activeViewId}
      query={query}
    />
  ) : null;
}

export function KeywordsGridScopeControl({
  activeViewId,
  keywordsPath,
  lens,
  locationOptions,
  query,
}: Readonly<ScopeProps>) {
  return (
    <KeywordsScopeControls
      basePath={keywordsPath}
      lens={lens}
      locationOptions={locationOptions}
      viewId={activeViewId}
      query={query}
    />
  );
}

type FilterDrawerProps = ScopeProps & {
  filters: KeywordFilters;
  onChange: (filters: KeywordFilters) => void;
  onClose: () => void;
  open: boolean;
  rows: KeywordRow[];
  facets?: RankTrackerListFacets;
  onApply?: (filters: KeywordFilters) => void;
};

export function KeywordsGridFilterDrawer({
  activeViewId,
  filters,
  keywordsPath,
  lens,
  locationOptions,
  onChange,
  onClose,
  onApply,
  open,
  rows,
  facets,
  query,
}: Readonly<FilterDrawerProps>) {
  return (
    <FiltersDrawer
      basePath={keywordsPath}
      facets={facets}
      filters={filters}
      lens={lens}
      locationOptions={locationOptions}
      onChange={onChange}
      onApply={onApply}
      onClose={onClose}
      open={open}
      rows={rows}
      viewId={activeViewId}
      query={query}
    />
  );
}
