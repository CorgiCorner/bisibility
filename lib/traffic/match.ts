import type { PageStatRow, QueryStatRow } from "@/lib/providers/types";
import { keywordPathCandidates, normalizePath } from "./url-match";

export type TrafficKeyword = {
  id: string;
  rankChecks: { rankingUrl: string | null }[];
  targetUrl: string | null;
  text: string;
};

export type MatchedPageStatRow = PageStatRow & { normalizedPath: string };

function keywordKey(value: string) {
  return value.trim().toLowerCase();
}

export function keywordsByText(keywords: TrafficKeyword[]) {
  const map = new Map<string, TrafficKeyword[]>();

  for (const keyword of keywords) {
    const key = keywordKey(keyword.text);
    const items = map.get(key) ?? [];
    items.push(keyword);
    map.set(key, items);
  }

  return map;
}

export function matchingKeywords(
  row: Pick<QueryStatRow, "query">,
  byText: Map<string, TrafficKeyword[]>,
) {
  return byText.get(keywordKey(row.query)) ?? [];
}

export function pageCandidatePaths(keywords: TrafficKeyword[]) {
  const paths = new Set<string>();

  for (const keyword of keywords) {
    const latestRankingUrl = keyword.rankChecks[0]?.rankingUrl ?? null;
    for (const path of keywordPathCandidates(keyword, latestRankingUrl)) {
      paths.add(path);
    }
  }

  return paths;
}

export function matchingPageRows(
  rows: PageStatRow[],
  candidatePaths: Set<string>,
): MatchedPageStatRow[] {
  return rows.flatMap((row) => {
    const normalizedPath = normalizePath(row.path);
    return candidatePaths.has(normalizedPath) ? [{ ...row, normalizedPath }] : [];
  });
}
