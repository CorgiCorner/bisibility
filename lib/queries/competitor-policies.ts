import "server-only";

import {
  competitorAppliesToMarket,
  type TrackedCompetitor,
} from "@/lib/competitors/serp-comparison";
import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";

// Internal project IDs only; public entry points authorize before loading policies.
export function loadCompetitorPolicies(projectId: string) {
  return prisma.competitor.findMany({
    orderBy: [{ label: "asc" }, { domain: "asc" }],
    select: {
      domain: true,
      label: true,
      publicId: true,
      scopePolicy: true,
      marketOverrides: {
        select: { mode: true, projectMarket: { select: { locationId: true } } },
        where: { projectMarket: { projectId, status: { not: "removed" } } },
      },
    },
    where: { projectId },
  });
}

export async function getKeywordCompetitors(
  projectRef: string,
  keywordRef: string,
): Promise<TrackedCompetitor[]> {
  const { project } = await requireReadableProject(projectRef);
  const [keyword, competitors] = await Promise.all([
    prisma.keyword.findFirst({
      where: { projectId: project.id, publicId: keywordRef },
      select: { locationId: true },
    }),
    loadCompetitorPolicies(project.id),
  ]);
  if (!keyword) return [];
  return competitors
    .filter((competitor) => competitorAppliesToMarket(competitor, keyword.locationId))
    .map(({ domain, label, publicId }) => ({ domain, label, publicId }));
}
