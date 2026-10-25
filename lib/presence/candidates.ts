import { prisma } from "@/lib/db/prisma";
import { gscPropertyContainsUrl } from "@/lib/providers/analytics/gsc-property-membership";
import type { GscSitemapStatus } from "@/lib/providers/analytics/gsc-sitemaps";
import { inspectionDay } from "./inspection-budget";
import { discoverSitemapCandidates } from "./sitemap-candidates";
import { persistSitemapSnapshot } from "./sitemap-snapshot";
import { presenceUrl } from "./url";

export async function refreshInspectionCandidates(input: {
  projectId: string;
  property: string;
  now: Date;
  runDeadline?: number;
  clock?: () => number;
  listSitemaps: () => Promise<GscSitemapStatus[]>;
}) {
  const targets = await prisma.keyword.findMany({
    select: { targetUrl: true },
    where: { projectId: input.projectId, targetUrl: { not: null } },
  });
  const keywords = new Set(
    targets.flatMap((row) => {
      const url = presenceUrl(row.targetUrl);
      return url && gscPropertyContainsUrl(input.property, url) ? [url] : [];
    }),
  );
  let discovery: Awaited<ReturnType<typeof discoverSitemapCandidates>> = {
    complete: false,
    urls: new Map(),
    parents: new Map(),
    childCounts: new Map(),
  };
  let sitemaps: GscSitemapStatus[] | null = null;
  let listError: unknown;
  try {
    sitemaps = await input.listSitemaps();
  } catch (error) {
    listError = error;
  }
  try {
    if (sitemaps === null) throw listError;
    discovery = await discoverSitemapCandidates(
      input.property,
      sitemaps.map((entry) => entry.path).sort(),
      undefined,
      { runDeadline: input.runDeadline, clock: input.clock },
    );
  } catch {
    /* Retain candidates and mark discovery incomplete when the provider is unavailable. */
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`indexing-discovery:${input.projectId}`}))`;
      const defaults = await tx.projectDefaults.findUnique({
        where: { projectId: input.projectId },
      });
      if (defaults?.indexingDiscoveryAt && defaults.indexingDiscoveryAt > input.now) {
        const current = await tx.urlPresence.findMany({
          where: {
            projectId: input.projectId,
            OR: [
              { url: { in: [...keywords] } },
              {
                lastListedAt: defaults.indexingDiscoveryAt,
                OR: [{ source: "sitemap" }, { sitemapUrl: { not: null } }],
              },
            ],
          },
          select: { url: true },
        });
        return current
          .filter(({ url }) => gscPropertyContainsUrl(input.property, url))
          .map(({ url }) => url);
      }
      await persistSitemapSnapshot(tx, { ...input, sitemaps, listError, discovery });
      const retained = discovery.complete
        ? []
        : await tx.urlPresence.findMany({
            where: {
              projectId: input.projectId,
              lastListedAt: defaults?.indexingDiscoveryAt ?? new Date(0),
              OR: [{ source: "sitemap" }, { sitemapUrl: { not: null } }],
            },
            select: { url: true },
          });
      const candidates = [
        ...new Set([...keywords, ...discovery.urls.keys(), ...retained.map((row) => row.url)]),
      ];
      await tx.urlPresence.createMany({
        skipDuplicates: true,
        data: candidates.map((url) => ({
          projectId: input.projectId,
          url,
          checkedAt: null,
          lastListedAt: input.now,
          source: keywords.has(url) ? ("keyword_target" as const) : ("sitemap" as const),
          sitemapUrl: discovery.urls.get(url) ?? null,
        })),
      });
      await tx.urlPresence.updateMany({
        where: { projectId: input.projectId, url: { in: candidates } },
        data: { lastListedAt: input.now },
      });
      const bySitemap = new Map<string, string[]>();
      for (const [url, sitemap] of discovery.urls)
        bySitemap.set(sitemap, [...(bySitemap.get(sitemap) ?? []), url]);
      for (const [sitemapUrl, urls] of bySitemap) {
        await tx.urlPresence.updateMany({
          where: { projectId: input.projectId, url: { in: urls } },
          data: { sitemapUrl },
        });
        await tx.urlPresence.updateMany({
          where: {
            projectId: input.projectId,
            url: { in: urls },
            source: { not: "keyword_target" },
          },
          data: { source: "sitemap" },
        });
      }
      if (keywords.size)
        await tx.urlPresence.updateMany({
          where: { projectId: input.projectId, url: { in: [...keywords] } },
          data: { source: "keyword_target" },
        });
      await tx.urlPresence.updateMany({
        where: {
          projectId: input.projectId,
          source: "keyword_target",
          url: { in: candidates.filter((url) => !keywords.has(url)) },
          OR: [{ url: { in: [...discovery.urls.keys()] } }, { sitemapUrl: { not: null } }],
        },
        data: { source: "sitemap" },
      });
      await tx.projectDefaults.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          indexingDiscoveryAt: input.now,
          indexingDiscoveryComplete: discovery.complete,
        },
        update: { indexingDiscoveryAt: input.now, indexingDiscoveryComplete: discovery.complete },
      });
      return candidates;
    },
    { timeout: 60_000 },
  );
}

type Candidate = {
  url: string;
  checkedAt: Date | null;
  inspectionFailedAt?: Date | null;
  source: string;
};
export function orderInspectionCandidates<T extends Candidate>(
  rows: T[],
  property: string,
  now: Date,
) {
  const day = inspectionDay(now);
  const priority = (row: T) =>
    row.source === "keyword_target" ? 0 : !row.checkedAt && row.source === "sitemap" ? 1 : 2;
  return rows
    .filter(
      (row) =>
        gscPropertyContainsUrl(property, row.url) &&
        (!row.checkedAt || row.checkedAt < day.gte || row.checkedAt >= day.lt) &&
        (!row.inspectionFailedAt ||
          row.inspectionFailedAt < day.gte ||
          row.inspectionFailedAt >= day.lt),
    )
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (a.checkedAt?.getTime() ?? 0) - (b.checkedAt?.getTime() ?? 0) ||
        a.url.localeCompare(b.url),
    );
}
