import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { presenceUrl } from "@/lib/presence/url";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";

async function currentPageIndexingQuery(
  projectId: string,
  includeManual: boolean,
  db: Prisma.TransactionClient,
) {
  const [defaults, targets] = await Promise.all([
    db.projectDefaults.findUnique({ where: { projectId } }),
    db.keyword.findMany({
      where: { projectId, targetUrl: { not: null } },
      select: { targetUrl: true },
    }),
  ]);
  const targetUrls = targets.flatMap(({ targetUrl }) => {
    const url = presenceUrl(targetUrl);
    return url ? [url] : [];
  });
  return {
    defaults,
    where: {
      projectId,
      OR: [
        ...(includeManual ? [{ source: "manual" as const }] : []),
        { url: { in: targetUrls } },
        ...(defaults?.indexingDiscoveryAt
          ? [
              {
                lastListedAt: defaults.indexingDiscoveryAt,
                OR: [{ source: "sitemap" as const }, { sitemapUrl: { not: null } }],
              },
            ]
          : []),
      ],
    } satisfies Prisma.UrlPresenceWhereInput,
  };
}

export async function currentPageIndexingRows(
  projectId: string,
  property: string,
  db: Prisma.TransactionClient = prisma,
) {
  const { defaults, where } = await currentPageIndexingQuery(projectId, false, db);
  const rows = await db.urlPresence.findMany({
    where,
    select: {
      url: true,
      checkedAt: true,
      inspectionError: true,
      verdict: true,
      coverageState: true,
      source: true,
    },
  });
  return { defaults, rows: rows.filter(({ url }) => gscPropertyContainsUrl(property, url)) };
}

export async function currentPageIndexingScope(
  projectId: string,
  property: string,
  includeManual = false,
  db: Prisma.TransactionClient = prisma,
) {
  const { defaults, where } = await currentPageIndexingQuery(projectId, includeManual, db);
  const candidates = await db.urlPresence.findMany({
    where,
    select: { url: true },
  });
  return {
    defaults,
    where: {
      projectId,
      url: {
        in: candidates
          .filter(({ url }) => gscPropertyContainsUrl(property, url))
          .map(({ url }) => url),
      },
    },
  };
}
