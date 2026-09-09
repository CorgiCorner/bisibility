"use client";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import {
  patchRankTrackerFilters,
  RANK_TRACKER_FILTER_FIELDS,
} from "@/lib/keywords/rank-tracker-navigation";
import type {
  RankTrackerQueryField,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { Dispatch, SetStateAction } from "react";
import { KeywordsGridFilterDrawer } from "./KeywordsGridFilterOverlays";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Props = Pick<KeywordsGridProps, "facets"> & {
  activeViewId: string | null;
  draftFilters: KeywordFilters;
  keywordsPath: string;
  lens: NonNullable<KeywordsGridProps["lens"]>;
  locationOptions: NonNullable<KeywordsGridProps["locations"]>;
  navigateQuery: (query: RankTrackerQueryState, present: RankTrackerQueryField[]) => void;
  onClose: () => void;
  open: boolean;
  query: RankTrackerQueryState;
  rows: KeywordRow[];
  setDraftFilters: Dispatch<SetStateAction<KeywordFilters>>;
};
export function KeywordsGridServerFilters(props: Props) {
  return (
    <KeywordsGridFilterDrawer
      activeViewId={props.activeViewId}
      facets={props.facets}
      filters={props.draftFilters}
      keywordsPath={props.keywordsPath}
      lens={props.lens}
      locationOptions={props.locationOptions}
      onApply={(next) => {
        props.navigateQuery(patchRankTrackerFilters(props.query, next), [
          ...RANK_TRACKER_FILTER_FIELDS,
          "page",
        ]);
        props.onClose();
      }}
      onChange={props.setDraftFilters}
      onClose={props.onClose}
      open={props.open}
      query={props.query}
      rows={props.rows}
    />
  );
}
