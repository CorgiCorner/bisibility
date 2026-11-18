import "server-only";
import { prisma } from "@/lib/db/prisma";
import { syncPauseSelection } from "@/lib/schedules/sync-pauses";
import { domainSchema, trackedProjectDomain } from "@/lib/schemas/project";
import { cache } from "react";
import { normalizeStoredSitemapReads, type SitemapReadRow } from "./sitemap-read-model";
import { latestSitemapReadsQuery } from "./sitemap-sql";

export const getStoredSitemapRead = cache(async (projectId: string) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { domain: true, syncPauses: syncPauseSelection("sitemap_fetch") },
  });
  const domain = project ? trackedProjectDomain(project.domain) : null;
  if (!project || !domain) return null;
  const normalized = domainSchema.safeParse(domain);
  if (!normalized.success) return null;
  const rows = await prisma.$queryRaw<SitemapReadRow[]>(latestSitemapReadsQuery(projectId));
  return normalizeStoredSitemapReads(
    rows,
    normalized.data,
    project.syncPauses.length === 0,
    new Date(),
    [`https://${normalized.data}/sitemap.xml`],
  );
});
