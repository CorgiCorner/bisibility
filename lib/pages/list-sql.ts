import { conversionsCte } from "@/lib/conversions/page-sql";
import type { ConversionSource } from "@/lib/conversions/types";
import { Prisma } from "@/lib/generated/prisma/client";
import { sessionsCte, vitalsPredicate } from "./list-sql-clauses";
import { canonicalPagePathSql } from "./page-path";
import {
  pageBucketSql,
  pageStatusDaySql,
  pageStatusKindSql,
  snapshotStatusCtes,
} from "./status-sql";
import type {
  ProjectPageCwvFilter,
  ProjectPageIndexGroup,
  ProjectPageSortKey,
  ProjectPageSourceKind,
  ProjectPageStatusFilter,
} from "./types";

export type ProjectPagesQueryInput = {
  conversionSource?: ConversionSource | null;
  coverageState?: string;
  cwv?: ProjectPageCwvFilter;
  from: Date;
  ga4Property: string | null;
  gscProperty: string | null;
  host: string;
  indexGroup?: ProjectPageIndexGroup;
  page: number;
  pageSize: number;
  projectId: string;
  search?: string;
  sessions: "ga4" | "none" | "plausible";
  sitemapState?: "listed" | "not_listed";
  sort: { by: ProjectPageSortKey; dir: "asc" | "desc" };
  status?: ProjectPageStatusFilter;
  source?: ProjectPageSourceKind;
  tagId?: string;
  to: Date;
};

/** Same decision as `pageIndexingGroup`, except a missing presence row stays null. */
export function sqlIndexGroup(row: {
  checkedAt: Date | null;
  id: string | null;
  inspectionError: string | null;
  verdict: string | null;
}) {
  if (row.id == null) return null;
  if (row.inspectionError != null) return "inspection_failed" as const;
  if (!row.checkedAt) return "not_checked" as const;
  return row.verdict === "PASS" ? ("indexed" as const) : ("not_indexed" as const);
}

const indexGroupSql = Prisma.sql`CASE
  WHEN presence.id IS NULL THEN NULL
  WHEN presence."inspectionError" IS NOT NULL THEN 'inspection_failed'
  WHEN presence."checkedAt" IS NULL THEN 'not_checked'
  WHEN presence.verdict = 'PASS' THEN 'indexed'
  ELSE 'not_indexed'
END`;

const sortExpressions: Record<ProjectPageSortKey, Prisma.Sql> = {
  aiCitations: Prisma.sql`filtered."aiCitations"`,
  clicks: Prisma.sql`filtered.clicks`,
  firstSeen: Prisma.sql`filtered."firstSeenAt"`,
  impressions: Prisma.sql`filtered.impressions`,
  keywords: Prisma.sql`filtered.keywords`,
  path: Prisma.sql`filtered.path`,
  position: Prisma.sql`filtered.position`,
  conversions: Prisma.sql`filtered."conversionValue"`,
  sessions: Prisma.sql`filtered."sessionValue"`,
};

function searchFilter(search: string | undefined) {
  const value = search?.trim();
  if (!value) return Prisma.sql`TRUE`;
  const pattern = `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return Prisma.sql`page.path ILIKE ${pattern} ESCAPE '\\'`;
}

function sourceFilter(source: ProjectPageSourceKind | undefined) {
  if (!source) return Prisma.empty;
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "project_page_sources" source_filter
    WHERE source_filter."pageId" = page.id
      AND source_filter.source = ${source}::"ProjectPageSourceKind"
  )`;
}

function tagFilter(tagId: string | undefined) {
  if (!tagId) return Prisma.empty;
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "page_tags" page_tag
    JOIN "tags" tag_row ON tag_row.id = page_tag."tagId"
    WHERE page_tag."pageId" = page.id
      AND (tag_row.id = ${tagId} OR tag_row."publicId" = ${tagId})
  )`;
}

function indexFilter(group: ProjectPageIndexGroup | undefined) {
  if (!group) return Prisma.empty;
  return Prisma.sql`AND ${indexGroupSql} = ${group}`;
}

function statusPredicate(status: ProjectPageStatusFilter | undefined, kind: Prisma.Sql) {
  if (status === "in_snapshot" || status === "new") return Prisma.sql`${kind} = ${status}`;
  if (status === "removed") return Prisma.sql`${kind} IN ('removed', 'redirected', 'gone')`;
  return Prisma.sql`TRUE`;
}

function sitemapPredicate(state: ProjectPagesQueryInput["sitemapState"]) {
  if (state === "listed") return Prisma.sql`COALESCE(sitemap.listed, false)`;
  if (state === "not_listed") return Prisma.sql`NOT COALESCE(sitemap.listed, false)`;
  return Prisma.sql`TRUE`;
}

function gscCte(input: ProjectPagesQueryInput) {
  if (!input.gscProperty) {
    return Prisma.sql`gsc AS (
      SELECT NULL::text AS path, NULL::int AS clicks, NULL::int AS impressions, NULL::float8 AS position
      WHERE false
    )`;
  }
  return Prisma.sql`gsc AS (
    SELECT path,
      SUM(clicks)::int AS clicks,
      SUM(impressions)::int AS impressions,
      SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
    FROM (
      SELECT ${canonicalPagePathSql(Prisma.sql`daily.page`, input.host)} AS path,
        daily.clicks, daily.impressions, daily.position
      FROM "search_analytics_page_daily" daily
      WHERE daily."projectId" = ${input.projectId}
        AND daily.property = ${input.gscProperty}
        AND daily."searchType" = 'web'
        AND daily.date >= ${input.from}::date
        AND daily.date <= ${input.to}::date
    ) raw
    WHERE path IS NOT NULL
    GROUP BY path
  )`;
}

function fromClause(input: ProjectPagesQueryInput) {
  return Prisma.sql`
    FROM "project_pages" page
    LEFT JOIN presence ON presence.path = page.path
    LEFT JOIN LATERAL (
      SELECT source."firstSeenAt", source."lastSeenAt", source.detail->>'listed' = 'true' AS listed
      FROM "project_page_sources" source
      WHERE source."pageId" = page.id AND source.source = 'sitemap'
    ) sitemap ON true
    LEFT JOIN gsc ON gsc.path = page.path
    LEFT JOIN sessions ON sessions.path = page.path
    LEFT JOIN conversions ON conversions.path = page.path
    LEFT JOIN keywords ON keywords.path = page.path
    LEFT JOIN citations ON citations.path = page.path
    LEFT JOIN "page_vitals" vitals
      ON vitals."pageId" = page.id AND vitals.strategy = 'mobile'
    WHERE page."projectId" = ${input.projectId}
      AND ${searchFilter(input.search)}
      ${sourceFilter(input.source)}
      ${indexFilter(input.indexGroup)}
      ${input.coverageState ? Prisma.sql`AND presence."coverageState" = ${input.coverageState}` : Prisma.empty}
      ${tagFilter(input.tagId)}
  `;
}

function withClause(input: ProjectPagesQueryInput) {
  return Prisma.sql`
    WITH ${snapshotStatusCtes(input.projectId)},
    presence AS (
      SELECT DISTINCT ON (path)
        path, id, "coverageState", "pageFetchState", "checkedAt", verdict, "inspectionError"
      FROM (
        SELECT presence_row.id, presence_row."coverageState", presence_row."pageFetchState",
          presence_row."checkedAt",
          presence_row.verdict, presence_row."inspectionError",
          ${canonicalPagePathSql(Prisma.sql`presence_row.url`, input.host)} AS path
        FROM "url_presences" presence_row
        WHERE presence_row."projectId" = ${input.projectId}
      ) raw
      WHERE path IS NOT NULL
      ORDER BY path, "checkedAt" DESC NULLS LAST, id ASC
    ),
    ${gscCte(input)},
    ${sessionsCte(input)},
    ${conversionsCte({
      from: input.from,
      host: input.host,
      projectId: input.projectId,
      source: input.conversionSource ?? null,
      to: input.to,
    })},
    keywords AS (
      SELECT path, COUNT(*)::int AS keywords
      FROM (
        SELECT ${canonicalPagePathSql(
          Prisma.sql`COALESCE(latest."expectedUrlAtCheck", keyword."targetUrl")`,
          input.host,
        )} AS path
        FROM "keywords" keyword
        LEFT JOIN LATERAL (
          SELECT check_row."expectedUrlAtCheck"
          FROM "rank_checks" check_row
          WHERE check_row."keywordId" = keyword.id
          ORDER BY check_row."checkedAt" DESC
          LIMIT 1
        ) latest ON true
        WHERE keyword."projectId" = ${input.projectId} AND keyword."archivedAt" IS NULL
      ) raw
      WHERE path IS NOT NULL
      GROUP BY path
    ),
    citations AS (
      SELECT path, COUNT(*)::int AS citations
      FROM (
        SELECT ${canonicalPagePathSql(Prisma.sql`citation.url`, input.host)} AS path
        FROM "ai_tracking_citations" citation
        JOIN "ai_tracking_samples" sample ON sample.id = citation."sampleId"
        WHERE sample."projectId" = ${input.projectId}
          AND COALESCE(sample."finishedAt", sample."createdAt") >= ${input.from}
          AND COALESCE(sample."finishedAt", sample."createdAt") <= ${input.to}
      ) raw
      WHERE path IS NOT NULL
      GROUP BY path
    )
  `;
}

export function projectPagesListQuery(input: ProjectPagesQueryInput) {
  const order =
    input.sort.dir === "desc"
      ? Prisma.sql`${sortExpressions[input.sort.by]} DESC NULLS LAST, filtered.path ASC, filtered.id ASC`
      : Prisma.sql`${sortExpressions[input.sort.by]} ASC NULLS LAST, filtered.path ASC, filtered.id ASC`;
  return {
    counts: Prisma.sql`
      ${withClause(input)}
      SELECT
        COUNT(*)::int AS "all",
        COUNT(*) FILTER (WHERE COALESCE(sitemap.listed, false))::int AS listed,
        COUNT(*) FILTER (WHERE NOT COALESCE(sitemap.listed, false))::int AS "notListed",
        COUNT(*) FILTER (WHERE ${pageBucketSql()} = 'in_snapshot')::int AS "inSnapshot",
        COUNT(*) FILTER (WHERE ${pageBucketSql()} = 'new')::int AS "newCount",
        COUNT(*) FILTER (WHERE ${pageBucketSql()} = 'removed')::int AS "removed",
        COUNT(*) FILTER (
          WHERE ${sitemapPredicate(input.sitemapState)}
            AND ${statusPredicate(input.status, pageStatusKindSql())}
            AND ${vitalsPredicate(input.cwv, Prisma.sql`vitals.status`)}
        )::int AS total
      ${fromClause(input)}
    `,
    rows: Prisma.sql`
      ${withClause(input)},
      filtered AS (
        SELECT page.id, page.path, page."firstSeenAt", page."lastSeenAt",
          COALESCE(sitemap.listed, false) AS listed,
          sitemap."lastSeenAt" AS "sitemapLastSeenAt",
          ${indexGroupSql} AS "indexGroup",
          presence.id AS "presenceId",
          presence."coverageState" AS "coverageState",
          presence."checkedAt" AS "checkedAt",
          presence.verdict,
          gsc.clicks, gsc.impressions, gsc.position,
          sessions.value AS "sessionValue",
          conversions.value AS "conversionValue",
          COALESCE(keywords.keywords, 0)::int AS keywords,
          COALESCE(citations.citations, 0)::int AS "aiCitations",
          ${pageStatusKindSql()} AS "statusKind",
          ${pageStatusDaySql()} AS "statusDay",
          vitals."lcpMs" AS "vitalsLcpMs",
          vitals."inpMs" AS "vitalsInpMs",
          vitals.cls AS "vitalsCls",
          vitals.source AS "vitalsSource",
          vitals.status AS "vitalsStatus",
          (
            SELECT jsonb_object_agg(
              source.source::text,
              jsonb_build_object('firstSeenAt', source."firstSeenAt", 'lastSeenAt', source."lastSeenAt")
            )
            FROM "project_page_sources" source
            WHERE source."pageId" = page.id
          ) AS sources
        ${fromClause(input)}
      )
      SELECT * FROM filtered
      WHERE ${
        input.sitemapState === "listed"
          ? Prisma.sql`filtered.listed`
          : input.sitemapState === "not_listed"
            ? Prisma.sql`NOT filtered.listed`
            : Prisma.sql`TRUE`
      }
        AND ${statusPredicate(input.status, Prisma.sql`filtered."statusKind"`)}
        AND ${vitalsPredicate(input.cwv, Prisma.sql`filtered."vitalsStatus"`)}
      ORDER BY ${order}
      LIMIT ${input.pageSize}
      OFFSET ${(input.page - 1) * input.pageSize}
    `,
  };
}
