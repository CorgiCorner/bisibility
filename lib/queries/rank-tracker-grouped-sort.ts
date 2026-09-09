import { Prisma } from "@/lib/generated/prisma/client";
import type {
  RankTrackerQueryState,
  RankTrackerSortField,
} from "@/lib/keywords/rank-tracker-query-types";

export const GROUPED_SQL_SORT_FIELDS = new Set<RankTrackerSortField>([
  "keyword",
  "position",
  "change",
  "volume",
  "difficulty",
  "sparkline",
  "lastChecked",
]);

const maximum = Prisma.sql`9007199254740991`;
const minimum = Prisma.sql`-9007199254740991`;

function sortExpression(field: RankTrackerSortField) {
  if (field === "position") return Prisma.sql`COALESCE(t."positionSort", ${maximum})`;
  if (field === "change") return Prisma.sql`COALESCE(t."changeSort", ${minimum})`;
  if (field === "volume") return Prisma.sql`COALESCE(t."volumeSort", ${minimum})`;
  if (field === "sparkline") return Prisma.sql`COALESCE(t."sparklineSort", ${maximum})`;
  if (field === "difficulty") return Prisma.sql`t."difficultySort"`;
  if (field === "lastChecked") return Prisma.sql`t."lastCheckedSort"`;
  return Prisma.sql`t."keywordSort" COLLATE "en-US-x-icu"`;
}

export function groupedRankTrackerOrderBy(sort: RankTrackerQueryState["sort"]) {
  const direction = sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const nulls =
    sort.field === "difficulty"
      ? Prisma.sql`NULLS LAST`
      : sort.direction === "asc"
        ? Prisma.sql`NULLS FIRST`
        : Prisma.sql`NULLS LAST`;
  return Prisma.sql`${sortExpression(sort.field)} ${direction} ${nulls},
    t."keywordSort" COLLATE "en-US-x-icu" ASC, t.term COLLATE "en-US-x-icu" ASC`;
}
