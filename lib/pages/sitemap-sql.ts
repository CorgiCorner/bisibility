import { Prisma } from "@/lib/generated/prisma/client";
import { SITEMAP_SNAPSHOT_RETENTION_DAYS } from "@/lib/sitemap/snapshot";
import type { StoredSitemapRead } from "./sitemap-read-model";

export function sitemapObservationCtes(_projectId: string, read: StoredSitemapRead | null) {
  return Prisma.sql`
    sitemap_read AS (
      SELECT ${read?.fetchedAt ?? null}::timestamp AS "fetchedAt",
        ${read?.complete !== false}::boolean AS complete,
        ${read?.freshSince ?? null}::timestamp AS "freshSince"
      WHERE ${read !== null && read.checked !== false}
    ),
    sitemap_read_pages AS (
      SELECT unnest(${read?.paths ?? []}::text[]) AS path
    ),
    newest_sitemap AS (
      SELECT (SELECT "fetchedAt" FROM sitemap_read) AS seen, ${read !== null}::boolean AS observed
    )
  `;
}

/** Positive evidence survives staggered reads; absence needs every root to cover the page. */
export function sitemapListedSql(
  listed = Prisma.sql`sitemap.listed`,
  lastSeen = Prisma.sql`sitemap."lastSeenAt"`,
) {
  return Prisma.sql`CASE
    WHEN page.path IS NULL OR (SELECT seen FROM newest_sitemap) IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM sitemap_read_pages WHERE path = page.path) THEN TRUE
    WHEN ${listed} IS TRUE AND ${lastSeen} > (SELECT seen FROM newest_sitemap)
      AND ${lastSeen} >= COALESCE((SELECT "freshSince" FROM sitemap_read), '-infinity'::timestamp) THEN TRUE
    WHEN NOT (SELECT complete FROM sitemap_read)
      OR page."firstSeenAt" > (SELECT seen FROM newest_sitemap) THEN NULL
    ELSE FALSE
  END`;
}

/** De-duplicate on the server before transferring retained entries. */
export function latestSitemapReadsQuery(projectId: string, now = new Date()) {
  return Prisma.sql`
    SELECT DISTINCT ON ("sitemapUrl") entries, "fetchedAt", "sitemapUrl", "urlCount", complete
    FROM "sitemap_snapshots"
    WHERE "projectId" = ${projectId}
      AND "fetchedAt" >= ${new Date(now.getTime() - SITEMAP_SNAPSHOT_RETENTION_DAYS * 86_400_000)}
    ORDER BY "sitemapUrl", "fetchedAt" DESC, id ASC
  `;
}

/** API rows share the registry identity and the exact Pages membership expression. */
export function pageSitemapMembershipQuery(
  projectId: string,
  read: StoredSitemapRead,
  rows: readonly { url: string; path: string | null; firstSeenAt: Date }[],
) {
  return Prisma.sql`
    WITH ${sitemapObservationCtes(projectId, read)},
    requested(url, path, "firstSeenAt") AS (
      VALUES ${Prisma.join(rows.map((row) => Prisma.sql`(${row.url}, ${row.path}::text, ${row.firstSeenAt}::timestamp)`))}
    ),
    page AS (
      SELECT requested.url, requested.path,
        COALESCE(registry."firstSeenAt", requested."firstSeenAt") AS "firstSeenAt", registry.id
      FROM requested
      LEFT JOIN "project_pages" registry
        ON registry."projectId" = ${projectId} AND registry.path = requested.path
    )
    SELECT page.url, ${sitemapListedSql()} AS listed
    FROM page
    LEFT JOIN LATERAL (
      SELECT source.detail->>'listed' = 'true' AS listed, source."lastSeenAt"
      FROM "project_page_sources" source
      WHERE source."pageId" = page.id AND source.source = 'sitemap'
    ) sitemap ON TRUE
  `;
}
