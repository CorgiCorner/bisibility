import type { Prisma } from "@/lib/generated/prisma/client";
import { type OverviewFilters, overviewKeywordWhere } from "@/lib/queries/overview-filters";

/** IDs are supplied only by the authorized assignment reader in the same snapshot; [] means empty. */
export function localOverviewKeywordWhere(
  projectId: string,
  filters: OverviewFilters,
  ids?: readonly string[],
): Prisma.KeywordWhereInput {
  const base = overviewKeywordWhere(projectId, filters);
  if (ids === undefined) return base;
  return {
    ...base,
    publicId: { in: [...ids] },
    locationRef: {
      projectMarkets: { none: { projectId, status: { not: "active" } } },
    },
  };
}
