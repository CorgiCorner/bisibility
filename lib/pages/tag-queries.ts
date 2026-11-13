import "server-only";

import { prisma } from "@/lib/db/prisma";
import { pageBucketSql, snapshotStatusCtes } from "./status-sql";
import type { TagPageRuleKind } from "./tag-pattern";
import { tagPageRuleKinds } from "./tag-pattern";
import type { PageTagRuleView, ProjectPageTagView } from "./tag-view";

type RuleRow = {
  autoJoin: boolean | null;
  excludePatterns: string[] | null;
  existingPages: number;
  keywords: number;
  kind: string | null;
  name: string;
  newPages: number;
  pages: number;
  pattern: string | null;
  removedPages: number;
  sitemapUrl: string | null;
  tagId: string;
  tagTargetingKeywords: boolean | null;
  urls: string[] | null;
};

function ruleOf(row: RuleRow): PageTagRuleView | null {
  if (!tagPageRuleKinds.includes(row.kind as TagPageRuleKind)) return null;
  return {
    autoJoin: row.autoJoin !== false,
    excludePatterns: row.excludePatterns ?? [],
    kind: row.kind as TagPageRuleKind,
    pattern: row.pattern,
    sitemapUrl: row.sitemapUrl,
    tagTargetingKeywords: row.tagTargetingKeywords === true,
    urls: row.urls ?? [],
  };
}

export async function listProjectSitemapUrls(projectId: string) {
  const sitemaps = await prisma.$queryRaw<{ url: string }[]>`
    SELECT DISTINCT sitemap_url.url AS url
    FROM "project_page_sources" source
    JOIN "project_pages" page ON page.id = source."pageId"
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(source.detail->'sitemapUrls') = 'array'
        THEN source.detail->'sitemapUrls' ELSE '[]'::jsonb END
    ) AS sitemap_url(url)
    WHERE page."projectId" = ${projectId} AND source.source = 'sitemap'
    ORDER BY url
    LIMIT 100
  `;
  return sitemaps.map((row) => row.url).filter((url) => url.length > 0);
}

export async function getProjectPageTagView(projectId: string): Promise<ProjectPageTagView> {
  const [rows, keywordOnly, counts, sitemaps] = await Promise.all([
    prisma.$queryRaw<RuleRow[]>`
      WITH ${snapshotStatusCtes(projectId)}
      SELECT tag."publicId" AS "tagId", tag.name, rule.kind, rule.pattern,
        rule."sitemapUrl" AS "sitemapUrl", rule."excludePatterns" AS "excludePatterns",
        rule.urls, rule."autoJoin" AS "autoJoin",
        rule."tagTargetingKeywords" AS "tagTargetingKeywords",
        COUNT(page_tag.id)::int AS pages,
        COUNT(page.id) FILTER (WHERE ${pageBucketSql()} = 'in_snapshot')::int AS "existingPages",
        COUNT(page.id) FILTER (WHERE ${pageBucketSql()} = 'new')::int AS "newPages",
        COUNT(page.id) FILTER (WHERE ${pageBucketSql()} = 'removed')::int AS "removedPages",
        (SELECT COUNT(*)::int FROM "keyword_tags" keyword_tag
          WHERE keyword_tag."tagId" = tag.id) AS keywords
      FROM "tags" tag
      LEFT JOIN "tag_page_rules" rule ON rule."tagId" = tag.id
      LEFT JOIN "page_tags" page_tag ON page_tag."tagId" = tag.id
      LEFT JOIN "project_pages" page ON page.id = page_tag."pageId"
      LEFT JOIN LATERAL (
        SELECT source."firstSeenAt", source."lastSeenAt"
        FROM "project_page_sources" source
        WHERE source."pageId" = page.id AND source.source = 'sitemap'::"ProjectPageSourceKind"
      ) sitemap ON true
      WHERE tag."projectId" = ${projectId}
      GROUP BY tag.id, rule.id
      HAVING COUNT(page_tag.id) > 0 OR rule.id IS NOT NULL
      ORDER BY tag.name ASC
      LIMIT 500
    `,
    prisma.$queryRaw<{ id: string; keywordCount: number; name: string }[]>`
      SELECT tag."publicId" AS id, tag.name, COUNT(keyword_tag.id)::int AS "keywordCount"
      FROM "tags" tag
      JOIN "keyword_tags" keyword_tag ON keyword_tag."tagId" = tag.id
      WHERE tag."projectId" = ${projectId}
        AND NOT EXISTS (SELECT 1 FROM "page_tags" page_tag WHERE page_tag."tagId" = tag.id)
        AND NOT EXISTS (SELECT 1 FROM "tag_page_rules" rule WHERE rule."tagId" = tag.id)
      GROUP BY tag.id
      ORDER BY tag.name ASC
      LIMIT 200
    `,
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT page_tag."tagId")::int AS count
      FROM "page_tags" page_tag
      JOIN "project_pages" page ON page.id = page_tag."pageId"
      WHERE page."projectId" = ${projectId}
    `,
    listProjectSitemapUrls(projectId),
  ]);
  const options = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: { _count: { select: { keywords: true } }, name: true, publicId: true },
    take: 500,
    where: { projectId },
  });
  return {
    keywordOnly: keywordOnly.map((tag) => ({
      id: tag.id,
      keywordCount: Number(tag.keywordCount),
      name: tag.name,
    })),
    options: options.map((tag) => ({
      id: tag.publicId,
      keywordCount: tag._count.keywords,
      name: tag.name,
    })),
    rows: rows.map((row) => ({
      existingPages: Number(row.existingPages),
      keywords: Number(row.keywords),
      name: row.name,
      newPages: Number(row.newPages),
      pages: Number(row.pages),
      removedPages: Number(row.removedPages),
      rule: ruleOf(row),
      tagId: row.tagId,
    })),
    sitemaps,
    tagCount: Number(counts[0]?.count ?? 0),
  };
}
