"use client";

import { BASE_KEYWORD_LENS } from "@/components/keywords/grid/keyword-scope-summary";
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
  keywordsPath: string;
  query: RankTrackerQueryState;
  searchValue: string;
  setSearchValue: Dispatch<SetStateAction<string>>;
};

export function useRankTrackerNavigation({
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
  const navigateQuery = (next: RankTrackerQueryState, present: RankTrackerQueryField[]) => {
    const requestedSearch = present.includes("search") ? next.search : searchValueRef.current;
    searchValueRef.current = requestedSearch;
    if (requestedSearch !== searchValue) setSearchValue(requestedSearch);
    markSearchCommitted();
    const rebased = { ...next, search: requestedSearch };
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
    onSearchCommit: () => {
      if (committedSearchRef.current === searchValueRef.current) return;
      navigateQuery(resetRankTrackerPage({ ...query, search: searchValueRef.current }), [
        "search",
        "page",
      ]);
    },
    resetScope: () =>
      navigateQuery(resetRankTrackerPage({ ...query, lens: BASE_KEYWORD_LENS }), [
        "device",
        "location",
        "page",
      ]),
  };
}
