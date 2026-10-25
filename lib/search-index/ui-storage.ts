import "server-only";
import { prisma } from "@/lib/db/prisma";
import { projectDate } from "@/lib/presence/project-day";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";
import { currentPageIndexingScope } from "./current-rows";
import { pageIndexingGroup } from "./report";
import { storedStripHistory } from "./strip-history";
import type { IndexingUrl } from "./ui-model";

export async function storedNotIndexedCount(projectId: string, property: string) {
  const { where } = await currentPageIndexingScope(projectId, property);
  return prisma.urlPresence.count({
    where: {
      AND: [
        where,
        {
          checkedAt: { not: null },
          inspectionError: null,
          OR: [{ verdict: { not: "PASS" } }, { verdict: null }],
        },
      ],
    },
  });
}

export async function storedIndexingSitemaps(projectId: string, property: string) {
  const { where } = await currentPageIndexingScope(projectId, property);
  const rows = await prisma.urlPresence.groupBy({
    by: ["sitemapUrl"],
    where: { AND: [where, { sitemapUrl: { not: null } }] },
    _count: true,
    orderBy: { sitemapUrl: "asc" },
  });
  // These are discovered origins, not a retained sitemaps.list response or submitted counts.
  return rows.flatMap((row) => (row.sitemapUrl ? [{ id: row.sitemapUrl, total: row._count }] : []));
}

export async function storedIndexingDetail(
  projectId: string,
  property: string,
  url: string,
): Promise<IndexingUrl | null> {
  if (!gscPropertyContainsUrl(property, url)) return null;
  const row = await prisma.urlPresence.findUnique({ where: { projectId_url: { projectId, url } } });
  if (!row) return null;
  const changes = await prisma.urlPresenceChange.findMany({
    where: { projectId, url },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 101,
    select: { at: true, previous: true, next: true },
  });
  const {
    id: _id,
    projectId: _projectId,
    lastListedAt: _listed,
    fullInspectionRecorded: _recorded,
    ...stored
  } = row;
  return {
    ...stored,
    historyThrough: projectDate(new Date(), "UTC"),
    historyAsOf: new Date(),
    stripChanges: await storedStripHistory(projectId, url),
    group: pageIndexingGroup(row),
    history: { changes: changes.slice(0, 100), complete: changes.length <= 100 },
  };
}
