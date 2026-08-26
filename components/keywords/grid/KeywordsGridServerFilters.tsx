"use client";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import {
  patchRankTrackerFilters,
  RANK_TRACKER_FILTER_FIELDS,
} from "@/lib/keywords/rank-tracker-navigation";
import type { Dispatch, SetStateAction } from "react";
import { KeywordsGridFilterDrawer } from "./KeywordsGridFilterOverlays";
import type { KeywordsGridProps } from "./keywords-grid-types";

type Query = KeywordsGridProps["query"];
type Props = Pick<KeywordsGridProps, "facets" | "rows"> & {
  activeViewId: string | null;
  draftFilters: KeywordFilters;
  filters: KeywordFilters;
  flatServer: boolean;
  keywordsPath: string;
  lens: NonNullable<KeywordsGridProps["lens"]>;
  locationOptions: NonNullable<KeywordsGridProps["locations"]>;
  navigateQuery: (
    query: Query,
    present: import("@/lib/keywords/rank-tracker-query-types").RankTrackerQueryField[],
  ) => void;
  onClose: () => void;
  open: boolean;
  query: Query;
  setDraftFilters: Dispatch<SetStateAction<KeywordFilters>>;
  setFilters: Dispatch<SetStateAction<KeywordFilters>>;
};
export function KeywordsGridServerFilters(props: Props) {
  if (!props.open) return null;
  return (
    <KeywordsGridFilterDrawer
      activeViewId={props.activeViewId}
      facets={props.facets}
      filters={props.flatServer ? props.draftFilters : props.filters}
      keywordsPath={props.keywordsPath}
      lens={props.lens}
      locationOptions={props.locationOptions}
      onApply={(next) => {
        if (props.query)
          props.navigateQuery(patchRankTrackerFilters(props.query, next), [
            ...RANK_TRACKER_FILTER_FIELDS,
            "page",
          ]);
        props.onClose();
      }}
      onChange={props.flatServer ? props.setDraftFilters : props.setFilters}
      onClose={props.onClose}
      query={props.flatServer ? props.query : undefined}
      rows={props.rows}
    />
  );
}
