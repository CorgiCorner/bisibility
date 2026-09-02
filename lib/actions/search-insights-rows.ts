"use server";

import { ROWS_PAGE_LIMIT, SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import {
  getSearchInsightsRowsPage,
  type SearchInsightsRowsPage,
} from "@/lib/search-insights/queries/first-view";
import { SEARCH_INSIGHTS_SORT_KEYS } from "@/lib/search-insights/queries/top-rows-sort";
import { z } from "zod";
import { parseActionInput } from "./_shared";

// One click can ask for a page, never for a saturated window: the client keeps asking until it
// holds the window or reaches the cap. The offset is bounded by that same cap, because every page
// re-aggregates the whole window before it skips - a deep offset is the expensive one.
const rowsSchema = z.object({
  kind: z.enum(["pages", "queries"]),
  limit: z.number().int().min(1).max(ROWS_PAGE_LIMIT),
  offset: z.number().int().min(0).max(SEARCH_INSIGHTS_ROWS_CAP),
  period: z.string().trim().max(8).optional(),
  projectId: z.string().trim().min(1).max(120),
  property: z.string().trim().min(1).max(300),
  // The sort key indexes the read's own expression table, so an unknown one is rejected here
  // rather than reaching a statement.
  sort: z
    .object({
      direction: z.enum(["asc", "desc"]),
      key: z.enum(SEARCH_INSIGHTS_SORT_KEYS),
    })
    .optional(),
});

/**
 * Paging for the tables' Show more and Show all controls. The read service authorizes the
 * project reference and re-authorizes the requested property while resolving the window, so
 * the client cannot make a property readable by naming it.
 */
export async function loadSearchInsightsRows(input: unknown): Promise<SearchInsightsRowsPage> {
  const data = parseActionInput(rowsSchema, input);
  return getSearchInsightsRowsPage(data.projectId, {
    kind: data.kind,
    limit: data.limit,
    offset: data.offset,
    period: data.period,
    property: data.property,
    sort: data.sort,
  });
}

export type LoadSearchInsightsRowsAction = typeof loadSearchInsightsRows;
