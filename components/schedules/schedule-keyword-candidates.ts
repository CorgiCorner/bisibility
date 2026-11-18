import type { ScheduleKeywordCandidate } from "./AddKeywordsDrawer";

export function filterCandidates(
  candidates: readonly ScheduleKeywordCandidate[],
  filters: { device: string; market: string; search: string; tag: string },
) {
  const query = filters.search.trim().toLowerCase();
  return candidates.filter(
    (candidate) =>
      (!query || candidate.keyword.toLowerCase().includes(query)) &&
      (filters.tag === "all" || candidate.tags.includes(filters.tag)) &&
      (filters.market === "all" || candidate.market === filters.market) &&
      (filters.device === "all" || candidate.device === filters.device),
  );
}
