import "server-only";

import { prisma } from "@/lib/db/prisma";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { MAX_PROJECT_PAGES_PER_SYNC } from "./observations";

const READ_LIMIT = MAX_PROJECT_PAGES_PER_SYNC + 1;

export type PageSyncReads = {
  citations: { firstSeenAt: Date; lastSeenAt: Date; url: string }[];
  keywords: {
    checkedAt: Date | null;
    createdAt: Date;
    expectedUrl: string | null;
    targetUrl: string | null;
  }[];
  manual: { detail: unknown; firstSeenAt: Date; lastSeenAt: Date; path: string }[];
  presences: { createdAt: Date; lastListedAt: Date | null; url: string }[];
  searchPages: { firstSeenAt: Date; lastSeenAt: Date; page: string }[];
  snapshots: { entries: unknown; fetchedAt: Date; sitemapUrl: string }[];
  truncated: boolean;
};

function capped<T>(rows: T[]) {
  if (rows.length < READ_LIMIT) return { rows, truncated: false };
  return { rows: rows.slice(0, MAX_PROJECT_PAGES_PER_SYNC), truncated: true };
}

export async function readPageSyncSources(projectId: string): Promise<PageSyncReads> {
  const [searchPages, snapshots, presences, keywords, citations, manual] = await Promise.all([
    prisma.$queryRaw<{ firstSeenAt: Date; lastSeenAt: Date; page: string }[]>`
      SELECT page, MIN(date) AS "firstSeenAt", MAX(date) AS "lastSeenAt"
      FROM "search_analytics_page_daily"
      WHERE "projectId" = ${projectId}
        AND "searchType" = ${SEARCH_INSIGHTS_SEARCH_TYPE}
        AND impressions > 0
      GROUP BY page
      ORDER BY page ASC
      LIMIT ${READ_LIMIT}
    `,
    prisma.$queryRaw<{ entries: unknown; fetchedAt: Date; sitemapUrl: string }[]>`
      SELECT DISTINCT ON ("sitemapUrl") "sitemapUrl", entries, "fetchedAt"
      FROM "sitemap_snapshots"
      WHERE "projectId" = ${projectId}
      ORDER BY "sitemapUrl", "fetchedAt" DESC
    `,
    prisma.$queryRaw<{ createdAt: Date; lastListedAt: Date | null; url: string }[]>`
      SELECT url, "lastListedAt", "createdAt"
      FROM "url_presences"
      WHERE "projectId" = ${projectId} AND source = 'sitemap'
      ORDER BY url ASC
      LIMIT ${READ_LIMIT}
    `,
    prisma.$queryRaw<
      {
        checkedAt: Date | null;
        createdAt: Date;
        expectedUrl: string | null;
        targetUrl: string | null;
      }[]
    >`
      SELECT k."targetUrl", k."createdAt", latest."expectedUrlAtCheck" AS "expectedUrl", latest."checkedAt"
      FROM "keywords" k
      LEFT JOIN LATERAL (
        SELECT rc."expectedUrlAtCheck", rc."checkedAt"
        FROM "rank_checks" rc
        WHERE rc."keywordId" = k.id
        ORDER BY rc."checkedAt" DESC
        LIMIT 1
      ) latest ON true
      WHERE k."projectId" = ${projectId}
        AND k."archivedAt" IS NULL
        AND (k."targetUrl" IS NOT NULL OR latest."expectedUrlAtCheck" IS NOT NULL)
      ORDER BY k.id ASC
      LIMIT ${READ_LIMIT}
    `,
    prisma.$queryRaw<{ firstSeenAt: Date; lastSeenAt: Date; url: string }[]>`
      SELECT c.url,
        MIN(COALESCE(s."finishedAt", s."createdAt")) AS "firstSeenAt",
        MAX(COALESCE(s."finishedAt", s."createdAt")) AS "lastSeenAt"
      FROM "ai_tracking_citations" c
      JOIN "ai_tracking_samples" s ON s.id = c."sampleId"
      WHERE s."projectId" = ${projectId}
      GROUP BY c.url
      ORDER BY c.url ASC
      LIMIT ${READ_LIMIT}
    `,
    prisma.$queryRaw<{ detail: unknown; firstSeenAt: Date; lastSeenAt: Date; path: string }[]>`
      SELECT p.path, s."firstSeenAt", s."lastSeenAt", s.detail
      FROM "project_page_sources" s
      JOIN "project_pages" p ON p.id = s."pageId"
      WHERE p."projectId" = ${projectId} AND s.source = 'manual'
    `,
  ]);

  const search = capped(searchPages);
  const presence = capped(presences);
  const keyword = capped(keywords);
  const citation = capped(citations);
  return {
    citations: citation.rows,
    keywords: keyword.rows,
    manual,
    presences: presence.rows,
    searchPages: search.rows,
    snapshots,
    truncated: search.truncated || presence.truncated || keyword.truncated || citation.truncated,
  };
}
