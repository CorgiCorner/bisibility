"use client";

import { BASE_KEYWORD_LENS } from "@/components/keywords/grid/keyword-scope-summary";
import { lensHref } from "@/lib/keywords/lens-model";
import {
  rankTrackerMutationPresence,
  rankTrackerNavigationHref,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import type {
  RankTrackerQueryField,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import { useRouter, useSearchParams } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useRef } from "react";

type Input = {
  activeViewId: string | null;
  flatServer: boolean;
  keywordsPath: string;
  query?: RankTrackerQueryState;
  searchValue: string;
  setSearchValue: Dispatch<SetStateAction<string>>;
};

export function useFlatRankTrackerNavigation({
  activeViewId,
  flatServer,
  keywordsPath,
  query,
  searchValue,
  setSearchValue,
}: Input) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchValueRef = useRef(searchValue);
  const committedSearchRef = useRef(searchValue);
  const markSearchCommitted = () => {
    committedSearchRef.current = searchValueRef.current;
  };
  const navigateQuery = (
    next: RankTrackerQueryState | undefined,
    present: RankTrackerQueryField[],
  ) => {
    if (!next) return;
    markSearchCommitted();
    const rebased = { ...next, search: searchValueRef.current };
    router.push(
      rankTrackerNavigationHref({
        basePath: keywordsPath,
        current: searchParams,
        present: rankTrackerMutationPresence(query ?? rebased, rebased, present),
        query: rebased,
      }),
    );
  };
  return {
    markSearchCommitted,
    navigateQuery,
    onSearchChange: (value: string) => {
      searchValueRef.current = value;
      setSearchValue(value);
    },
    onSearchCommit:
      flatServer && query
        ? () => {
            if (committedSearchRef.current === searchValueRef.current) return;
            navigateQuery(resetRankTrackerPage({ ...query, search: searchValueRef.current }), [
              "search",
              "page",
            ]);
          }
        : undefined,
    resetScope: () =>
      flatServer && query
        ? navigateQuery(resetRankTrackerPage({ ...query, lens: BASE_KEYWORD_LENS }), [
            "device",
            "location",
            "page",
          ])
        : router.push(lensHref(keywordsPath, BASE_KEYWORD_LENS, activeViewId)),
  };
}
