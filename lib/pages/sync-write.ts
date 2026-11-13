import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createId } from "@paralleldrive/cuid2";
import type { PageObservation } from "./observations";
import { pagePathHash } from "./page-path";

const WRITE_CHUNK = 200;

function chunks<T>(values: readonly T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

export async function writePageObservations(
  projectId: string,
  pages: readonly PageObservation[],
  now: Date,
) {
  let sources = 0;
  for (const chunk of chunks(pages, WRITE_CHUNK)) {
    const ids = chunk.map(() => createId());
    const written = await prisma.$queryRaw<{ id: string; path: string }[]>`
      INSERT INTO "project_pages" (
        "id", "projectId", "path", "pathHash", "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt"
      )
      SELECT id, ${projectId}, path, path_hash, first_seen::timestamptz, last_seen::timestamptz,
        ${now}::timestamptz, ${now}::timestamptz
      FROM UNNEST(
        ${ids}::text[],
        ${chunk.map((page) => page.path)}::text[],
        ${chunk.map((page) => pagePathHash(page.path))}::text[],
        ${chunk.map((page) => page.firstSeenAt.toISOString())}::text[],
        ${chunk.map((page) => page.lastSeenAt.toISOString())}::text[]
      ) AS rows(id, path, path_hash, first_seen, last_seen)
      ON CONFLICT ("projectId", "pathHash") DO UPDATE SET
        "firstSeenAt" = LEAST("project_pages"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("project_pages"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "updatedAt" = CASE
          WHEN "project_pages"."firstSeenAt" IS NOT DISTINCT FROM LEAST("project_pages"."firstSeenAt", EXCLUDED."firstSeenAt")
           AND "project_pages"."lastSeenAt" IS NOT DISTINCT FROM GREATEST("project_pages"."lastSeenAt", EXCLUDED."lastSeenAt")
          THEN "project_pages"."updatedAt"
          ELSE EXCLUDED."updatedAt"
        END
      RETURNING "id", "path"
    `;
    const pageIds = new Map(written.map((row) => [row.path, row.id]));
    const sourceRows = chunk.flatMap((page) => {
      const pageId = pageIds.get(page.path);
      if (!pageId) return [];
      return page.sources.map((source) => ({
        detail: source.detail ? JSON.stringify(source.detail) : "",
        firstSeenAt: source.firstSeenAt.toISOString(),
        id: createId(),
        lastSeenAt: source.lastSeenAt.toISOString(),
        pageId,
        source: source.source,
      }));
    });
    if (sourceRows.length === 0) continue;
    sources += sourceRows.length;
    await prisma.$executeRaw`
      INSERT INTO "project_page_sources" (
        "id", "pageId", "source", "firstSeenAt", "lastSeenAt", "detail", "createdAt", "updatedAt"
      )
      SELECT id, page_id, source::"ProjectPageSourceKind", first_seen::timestamptz, last_seen::timestamptz,
        CASE WHEN detail = '' THEN NULL ELSE detail::jsonb END,
        ${now}::timestamptz, ${now}::timestamptz
      FROM UNNEST(
        ${sourceRows.map((row) => row.id)}::text[],
        ${sourceRows.map((row) => row.pageId)}::text[],
        ${sourceRows.map((row) => row.source)}::text[],
        ${sourceRows.map((row) => row.firstSeenAt)}::text[],
        ${sourceRows.map((row) => row.lastSeenAt)}::text[],
        ${sourceRows.map((row) => row.detail)}::text[]
      ) AS rows(id, page_id, source, first_seen, last_seen, detail)
      ON CONFLICT ("pageId", "source") DO UPDATE SET
        "firstSeenAt" = LEAST("project_page_sources"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("project_page_sources"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "detail" = CASE
          WHEN EXCLUDED.source = 'sitemap'::"ProjectPageSourceKind" THEN EXCLUDED.detail
          ELSE COALESCE("project_page_sources"."detail", EXCLUDED.detail)
        END,
        "updatedAt" = CASE
          WHEN "project_page_sources"."firstSeenAt" IS NOT DISTINCT FROM LEAST("project_page_sources"."firstSeenAt", EXCLUDED."firstSeenAt")
           AND "project_page_sources"."lastSeenAt" IS NOT DISTINCT FROM GREATEST("project_page_sources"."lastSeenAt", EXCLUDED."lastSeenAt")
           AND "project_page_sources"."detail" IS NOT DISTINCT FROM CASE
             WHEN EXCLUDED.source = 'sitemap'::"ProjectPageSourceKind" THEN EXCLUDED.detail
             ELSE COALESCE("project_page_sources"."detail", EXCLUDED.detail)
           END
          THEN "project_page_sources"."updatedAt"
          ELSE EXCLUDED."updatedAt"
        END
    `;
  }
  return { pages: pages.length, sources };
}
