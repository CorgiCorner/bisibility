"use server";

import { getKeywordRows } from "@/lib/queries/keywords";

export type KeywordHit = { id: string; label: string };

const MIN_QUERY_LENGTH = 2;
const MAX_HITS = 8;

/** The explicit project id and row query authorization prevent cross-workspace results. */
export async function searchKeywords(projectId: string, rawQuery: string): Promise<KeywordHit[]> {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const rows = await getKeywordRows(projectId);
  return rows
    .filter((row) => row.keyword.toLowerCase().includes(query))
    .slice(0, MAX_HITS)
    .map((row) => ({ id: row.id, label: row.keyword }));
}
