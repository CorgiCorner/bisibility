import "server-only";

import {
  type OverviewCompetitorComparison,
  summarizeOverviewCompetitors,
} from "@/lib/competitors/overview-comparison";
import { prisma } from "@/lib/db/prisma";
import {
  organicDomainRanksFromRaw,
  storedOrganicDomainRanks,
} from "@/lib/rank-check/organic-ranks";
import { requireReadableProject } from "./_auth";
import { loadCompetitorPolicies } from "./competitor-policies";
import { type OverviewFilters, overviewKeywordWhere, overviewRangeStart } from "./overview-filters";

const LIMIT = 2000;

export async function getOverviewCompetitors(
  projectRef: string,
  filters: OverviewFilters,
  now = new Date(),
): Promise<OverviewCompetitorComparison | null> {
  const { project } = await requireReadableProject(projectRef);
  const competitors = await loadCompetitorPolicies(project.id);
  if (competitors.length === 0) return null;
  const keywords = await prisma.keyword.findMany({
    where: overviewKeywordWhere(project.id, filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIMIT + 1,
    select: {
      locationId: true,
      rankChecks: {
        where: {
          status: "completed",
          checkedAt: { gte: overviewRangeStart(now, filters.range), lte: now },
        },
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, organicRanks: true, position: true, degradedToCountry: true },
      },
    },
  });
  const selected = keywords.slice(0, LIMIT);
  const legacyIds = selected.flatMap(({ rankChecks: [check] }) =>
    check && !check.degradedToCountry && check.organicRanks == null ? [check.id] : [],
  );
  const legacy = legacyIds.length
    ? await prisma.rankCheck.findMany({
        where: { id: { in: legacyIds }, keyword: { projectId: project.id }, status: "completed" },
        select: { id: true, raw: true },
      })
    : [];
  const legacyRanks = new Map(
    legacy.map((check) => [check.id, organicDomainRanksFromRaw(check.raw)]),
  );
  const rows = summarizeOverviewCompetitors(
    competitors,
    selected.map(({ locationId, rankChecks: [check] }) => ({
      locationId,
      ownPosition: check?.position ?? null,
      ranks:
        check && !check.degradedToCountry
          ? (storedOrganicDomainRanks(check.organicRanks) ?? legacyRanks.get(check.id) ?? null)
          : null,
    })),
  );
  return rows.length ? { rows, limited: keywords.length > LIMIT } : null;
}
