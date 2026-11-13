import { Prisma } from "@/lib/generated/prisma/client";

/** Active snapshot and the newest sitemap observation. Shared by the list and tag queries. */
export function snapshotStatusCtes(projectId: string) {
  return Prisma.sql`
    active_snapshot AS (
      SELECT id, "takenOn"::date AS "takenOn", "pageCount"
      FROM "page_snapshots"
      WHERE "projectId" = ${projectId} AND "archivedAt" IS NULL
      LIMIT 1
    ),
    newest_sitemap AS (
      SELECT MAX(source."lastSeenAt") AS seen
      FROM "project_page_sources" source
      JOIN "project_pages" observed ON observed.id = source."pageId"
      WHERE observed."projectId" = ${projectId} AND source.source = 'sitemap'::"ProjectPageSourceKind"
    )
  `;
}

function inSnapshotSql() {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "page_snapshot_pages" member
    WHERE member."snapshotId" = (SELECT id FROM active_snapshot)
      AND member."pageId" = page.id
  )`;
}

/** in_snapshot, new, removed, or null. Redirect and gone stay inside removed. */
export function pageBucketSql() {
  const firstSeen = Prisma.sql`COALESCE(sitemap."firstSeenAt", page."firstSeenAt")`;
  const taken = Prisma.sql`(SELECT "takenOn" FROM active_snapshot)`;
  const newest = Prisma.sql`(SELECT seen FROM newest_sitemap)`;
  const last = Prisma.sql`sitemap."lastSeenAt"`;
  const inSnapshot = inSnapshotSql();
  return Prisma.sql`CASE
    WHEN (SELECT id FROM active_snapshot) IS NULL THEN NULL
    WHEN (${inSnapshot} OR ${firstSeen}::date > ${taken})
      AND ${last} IS NOT NULL
      AND ${newest} IS NOT NULL
      AND ${last}::date < ${newest}::date
    THEN 'removed'
    WHEN ${inSnapshot} THEN 'in_snapshot'
    WHEN ${firstSeen}::date > ${taken} THEN 'new'
    ELSE NULL
  END`;
}

/** Display kind. Uses the presence alias already joined by the page list. */
export function pageStatusKindSql() {
  const bucket = pageBucketSql();
  const fetchState = Prisma.sql`lower(COALESCE(presence."pageFetchState", ''))`;
  const coverage = Prisma.sql`lower(COALESCE(presence."coverageState", ''))`;
  return Prisma.sql`CASE
    WHEN ${bucket} = 'removed' AND (${fetchState} LIKE '%redirect%' OR ${coverage} LIKE '%redirect%')
      THEN 'redirected'
    WHEN ${bucket} = 'removed' AND (
      ${fetchState} LIKE '%not_found%'
      OR ${fetchState} LIKE '%soft_404%'
      OR ${coverage} LIKE '%not found%'
      OR ${coverage} LIKE '%404%'
    ) THEN 'gone'
    ELSE ${bucket}
  END`;
}

export function pageStatusDaySql() {
  const bucket = pageBucketSql();
  const firstSeen = Prisma.sql`COALESCE(sitemap."firstSeenAt", page."firstSeenAt")`;
  const taken = Prisma.sql`(SELECT "takenOn" FROM active_snapshot)`;
  return Prisma.sql`CASE
    WHEN ${bucket} = 'removed' THEN (sitemap."lastSeenAt"::date - ${taken}) + 1
    WHEN ${bucket} = 'new' THEN (${firstSeen}::date - ${taken}) + 1
    ELSE NULL
  END`;
}
