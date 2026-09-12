import type { RankedKeywordsPage } from "@/lib/providers/types";

export type KeywordSort =
  | "cpc"
  | "difficulty"
  | "estimatedTraffic"
  | "keyword"
  | "position"
  | "rankAbsoluteDelta"
  | "searchVolume";

export const keywordValue = {
  cpc: (row: RankedKeywordsPage["rows"][number]) => row.cpcCents,
  difficulty: (row: RankedKeywordsPage["rows"][number]) => row.difficulty,
  estimatedTraffic: (row: RankedKeywordsPage["rows"][number]) => row.estimatedTraffic,
  keyword: (row: RankedKeywordsPage["rows"][number]) => row.keyword,
  position: (row: RankedKeywordsPage["rows"][number]) => row.position,
  rankAbsoluteDelta: (row: RankedKeywordsPage["rows"][number]) => row.rankAbsoluteDelta,
  searchVolume: (row: RankedKeywordsPage["rows"][number]) => row.searchVolume,
} satisfies Record<
  KeywordSort,
  (row: RankedKeywordsPage["rows"][number]) => number | string | null
>;
