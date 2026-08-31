"use client";

import type { SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { createContext, useContext } from "react";
import type { SearchInsightsListKind } from "./drawer-model";

/**
 * What the tables and chips need from the drawer stack. It travels through context because the
 * body is streamed from the server and cannot be handed callbacks as props.
 */
export type SearchInsightsDrawerHandlers = {
  /** The queries with a Rank Tracker write in flight, so each of their rows can say so. */
  adding: ReadonlySet<string>;
  /** The chip's own count travels with the click, so a list frame is titled before it loads. */
  openList: (which: SearchInsightsListKind, count: number, namedQueryCount: number) => void;
  openPage: (row: SearchInsightsPageRow) => void;
  openQuery: (row: { query: string }) => void;
  track: (row: { query: string }) => void;
  /** Normalized query texts added in this session, before the server view catches up. */
  tracked: ReadonlySet<string>;
};

const NO_DRAWERS: SearchInsightsDrawerHandlers = {
  adding: new Set(),
  openList: () => undefined,
  openPage: () => undefined,
  openQuery: () => undefined,
  track: () => undefined,
  tracked: new Set(),
};

export const SearchInsightsDrawerContext = createContext(NO_DRAWERS);

export function useSearchInsightsDrawerHandlers() {
  return useContext(SearchInsightsDrawerContext);
}
