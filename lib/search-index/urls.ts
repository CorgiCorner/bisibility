import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { sitemapMembershipValue } from "@/lib/pages/export-csv";
import { pagePathForProject } from "@/lib/pages/page-path";
import { getStoredSitemapRead } from "@/lib/pages/sitemap-read";
import { pageSitemapMembershipQuery } from "@/lib/pages/sitemap-sql";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { currentPageIndexingScope } from "./current-rows";
import { pageIndexingGroup } from "./report";
import { pageIndexingUrlsQuerySchema } from "./report-schema";
import { connectionForProject } from "./service";
import { type IndexingPageOptions, readIndexingPage } from "./url-page";

export async function listPageIndexingUrls(
  projectId: string,
  query: unknown,
  pageOptions?: IndexingPageOptions,
) {
  const input = pageIndexingUrlsQuerySchema.parse(query);
  const { property } = await connectionForProject(projectId);
  const { where: current } = await currentPageIndexingScope(
    projectId,
    property,
    input.source === "manual",
  );
  const groups: Record<string, Prisma.UrlPresenceWhereInput> = {
    indexed: { checkedAt: { not: null }, inspectionError: null, verdict: "PASS" },
    not_indexed: {
      checkedAt: { not: null },
      inspectionError: null,
      OR: [{ verdict: { not: "PASS" } }, { verdict: null }],
    },
    inspection_failed: { inspectionError: { not: null } },
    not_checked: { checkedAt: null, inspectionError: null },
  };
  const changed = input.changed_since
    ? await prisma.urlPresenceChange.findMany({
        where: {
          projectId,
          at: { gte: new Date(input.changed_since) },
          previous: { not: Prisma.JsonNull },
        },
        distinct: ["url"],
        select: { url: true },
      })
    : null;
  const where: Prisma.UrlPresenceWhereInput & { projectId: string } = {
    ...(input.group ? groups[input.group] : {}),
    ...(input.coverage_state === undefined
      ? {}
      : { coverageState: input.coverage_state === "Unspecified" ? null : input.coverage_state }),
    ...(input.sitemap === undefined ? {} : { sitemapUrl: input.sitemap }),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.search === undefined ? {} : { url: { contains: input.search, mode: "insensitive" } }),
    projectId,
    AND: [
      current,
      ...(changed ? [{ url: { in: changed.map((row) => row.url) } }] : []),
      ...(input.cursor === undefined ? [] : [{ url: { gt: input.cursor } }]),
    ],
  };
  const paged = pageOptions ? await readIndexingPage(where, input.limit, pageOptions) : undefined;
  const rows =
    paged?.rows ??
    (await prisma.urlPresence.findMany({ where, orderBy: { url: "asc" }, take: input.limit + 1 }));
  const page = paged ? rows : rows.slice(0, input.limit);
  const sitemapRead = await getStoredSitemapRead(projectId);
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { domain: true },
  });
  const domain = trackedProjectDomain(project?.domain) ?? "";
  const memberships =
    sitemapRead && page.length
      ? await prisma.$queryRaw<{ url: string; listed: boolean | null }[]>(
          pageSitemapMembershipQuery(
            projectId,
            sitemapRead,
            page.map((row) => ({
              url: row.url,
              path: pagePathForProject(domain, row.url),
              firstSeenAt: row.createdAt,
            })),
          ),
        )
      : [];
  const membershipByUrl = new Map(memberships.map((row) => [row.url, row.listed]));
  const data = await Promise.all(
    page.map(
      async ({
        id: _id,
        projectId: _projectId,
        lastListedAt: _listed,
        fullInspectionRecorded: _recorded,
        ...row
      }) => ({
        ...row,
        group: pageIndexingGroup(row),
        sitemapState: sitemapMembershipValue(membershipByUrl.get(row.url) ?? null),
        sitemapChecked: (membershipByUrl.get(row.url) ?? null) !== null,
        ...(input.history === "true"
          ? {
              history: await prisma.urlPresenceChange
                .findMany({
                  where: { projectId, url: row.url },
                  orderBy: [{ at: "desc" }, { id: "desc" }],
                  take: 101,
                  select: { at: true, previous: true, next: true },
                })
                .then((history) => ({
                  changes: history.slice(0, 100),
                  complete: history.length <= 100,
                })),
            }
          : {}),
      }),
    ),
  );
  return {
    data,
    meta: {
      next_cursor: !paged && rows.length > input.limit ? (page.at(-1)?.url ?? null) : null,
      ...(paged ? { total: paged.total, page: paged.page } : {}),
    },
  };
}
