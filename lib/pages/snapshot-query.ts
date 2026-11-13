import { conversionDailyMetricCte } from "@/lib/conversions/page-sql";
import type { ConversionSource } from "@/lib/conversions/types";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalPagePathSql } from "./page-path";
import type { SnapshotMetricId } from "./snapshot-view";
import { pageBucketSql, snapshotStatusCtes } from "./status-sql";

export type SnapshotMetricQuery = {
  conversionSource?: ConversionSource | null;
  from: Date;
  ga4Property: string | null;
  gscProperty: string | null;
  host: string;
  metric: SnapshotMetricId;
  projectId: string;
  sessions: "ga4" | "none" | "plausible";
  tagId?: string;
  to: Date;
};

function tagLimit(tagId: string | undefined) {
  if (!tagId) return Prisma.sql`TRUE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "page_tags" page_tag
    JOIN "tags" tag_row ON tag_row.id = page_tag."tagId"
    WHERE page_tag."pageId" = page.id
      AND (tag_row.id = ${tagId} OR tag_row."publicId" = ${tagId})
  )`;
}

function metricCte(input: SnapshotMetricQuery) {
  if (input.metric === "clicks" && input.gscProperty) {
    return Prisma.sql`metric AS (
      SELECT day, path, SUM(value)::int AS value
      FROM (
        SELECT daily.date::date AS day,
          ${canonicalPagePathSql(Prisma.sql`daily.page`, input.host)} AS path,
          daily.clicks AS value
        FROM "search_analytics_page_daily" daily
        WHERE daily."projectId" = ${input.projectId}
          AND daily.property = ${input.gscProperty}
          AND daily."searchType" = 'web'
          AND daily.date >= ${input.from}::date
          AND daily.date <= ${input.to}::date
      ) raw
      WHERE path IS NOT NULL
      GROUP BY day, path
    )`;
  }
  if (input.metric === "sessions" && input.sessions === "ga4" && input.ga4Property) {
    return Prisma.sql`metric AS (
      SELECT day, path, SUM(value)::int AS value
      FROM (
        SELECT daily.date::date AS day,
          ${canonicalPagePathSql(Prisma.sql`daily.path`, input.host)} AS path,
          daily.sessions AS value
        FROM "organic_sessions_page_daily" daily
        WHERE daily."projectId" = ${input.projectId}
          AND daily.property = ${input.ga4Property}
          AND daily.date >= ${input.from}::date
          AND daily.date <= ${input.to}::date
      ) raw
      WHERE path IS NOT NULL
      GROUP BY day, path
    )`;
  }
  if (input.metric === "sessions" && input.sessions === "plausible") {
    return Prisma.sql`metric AS (
      SELECT day, path, value
      FROM (
        SELECT DISTINCT ON (path)
          date::date AS day, path, sessions AS value
        FROM (
          SELECT snapshot.date, snapshot.sessions,
            ${canonicalPagePathSql(Prisma.sql`snapshot.path`, input.host)} AS path
          FROM "page_traffic_snapshots" snapshot
          WHERE snapshot."projectId" = ${input.projectId}
            AND snapshot.provider = 'plausible'
            AND snapshot."windowDays" = 28
            AND snapshot.date >= ${input.from}::date
            AND snapshot.date <= ${input.to}::date
        ) raw
        WHERE path IS NOT NULL
        ORDER BY path, day DESC
      ) latest
    )`;
  }
  if (input.metric === "conversions") {
    return conversionDailyMetricCte({
      from: input.from,
      host: input.host,
      projectId: input.projectId,
      source: input.conversionSource ?? null,
      to: input.to,
    });
  }
  if (input.metric === "ai_cites") {
    return Prisma.sql`metric AS (
      SELECT day, path, COUNT(*)::int AS value
      FROM (
        SELECT COALESCE(sample."finishedAt", sample."createdAt")::date AS day,
          ${canonicalPagePathSql(Prisma.sql`citation.url`, input.host)} AS path
        FROM "ai_tracking_citations" citation
        JOIN "ai_tracking_samples" sample ON sample.id = citation."sampleId"
        WHERE sample."projectId" = ${input.projectId}
          AND COALESCE(sample."finishedAt", sample."createdAt") >= ${input.from}
          AND COALESCE(sample."finishedAt", sample."createdAt") < (${input.to}::date + INTERVAL '1 day')
      ) raw
      WHERE path IS NOT NULL
      GROUP BY day, path
    )`;
  }
  return Prisma.sql`metric AS (
    SELECT NULL::date AS day, NULL::text AS path, NULL::int AS value WHERE false
  )`;
}

const existingValue = Prisma.sql`(
  members.bucket = 'in_snapshot'
  OR (members.bucket = 'removed' AND members.in_snapshot AND metric.day <= members.sitemap_last)
)`;

const freshValue = Prisma.sql`(
  members.bucket = 'new'
  OR (members.bucket = 'removed' AND NOT members.in_snapshot AND metric.day <= members.sitemap_last)
)`;

const removedValue = Prisma.sql`members.bucket = 'removed' AND metric.day <= members.sitemap_last`;

function membersCte(input: SnapshotMetricQuery) {
  return Prisma.sql`members AS (
    SELECT page.id, page.path,
      sitemap."lastSeenAt"::date AS sitemap_last,
      ${pageBucketSql()} AS bucket,
      EXISTS (
        SELECT 1 FROM "page_snapshot_pages" member
        WHERE member."snapshotId" = (SELECT id FROM active_snapshot)
          AND member."pageId" = page.id
      ) AS in_snapshot
    FROM "project_pages" page
    LEFT JOIN LATERAL (
      SELECT source."firstSeenAt", source."lastSeenAt"
      FROM "project_page_sources" source
      WHERE source."pageId" = page.id AND source.source = 'sitemap'::"ProjectPageSourceKind"
    ) sitemap ON true
    WHERE page."projectId" = ${input.projectId}
      AND ${tagLimit(input.tagId)}
  )`;
}

export function existingVsNewQueries(input: SnapshotMetricQuery) {
  const withMembers = Prisma.sql`
    WITH ${snapshotStatusCtes(input.projectId)},
    ${metricCte(input)},
    ${membersCte(input)}
  `;
  return {
    daily: Prisma.sql`
      ${withMembers}
      SELECT metric.day::text AS day,
        COALESCE(SUM(metric.value) FILTER (WHERE ${existingValue}), 0)::int AS existing,
        COALESCE(SUM(metric.value) FILTER (WHERE ${freshValue}), 0)::int AS fresh,
        COALESCE(SUM(metric.value) FILTER (WHERE ${removedValue}), 0)::int AS removed
      FROM metric
      JOIN members ON members.path = metric.path
      GROUP BY metric.day
      ORDER BY metric.day
    `,
    summary: Prisma.sql`
      ${withMembers}
      SELECT
        COALESCE((SELECT "pageCount" FROM active_snapshot), 0)::int AS "snapshotPages",
        COUNT(*) FILTER (WHERE members.bucket = 'in_snapshot')::int AS "existingPages",
        COUNT(*) FILTER (WHERE members.bucket = 'new')::int AS "freshPages",
        COUNT(*) FILTER (WHERE members.bucket = 'removed')::int AS "removedPages"
      FROM members
    `,
    tags: Prisma.sql`
      ${withMembers}
      SELECT tag."publicId" AS "tagId", tag.name,
        COUNT(DISTINCT members.id) FILTER (WHERE members.bucket = 'in_snapshot')::int AS "existingPages",
        COUNT(DISTINCT members.id) FILTER (WHERE members.bucket = 'new')::int AS "freshPages",
        COALESCE(SUM(metric.value) FILTER (WHERE ${existingValue}), 0)::int AS "existingValue",
        COALESCE(SUM(metric.value) FILTER (WHERE ${freshValue}), 0)::int AS "freshValue"
      FROM members
      JOIN "page_tags" page_tag ON page_tag."pageId" = members.id
      JOIN "tags" tag ON tag.id = page_tag."tagId"
      LEFT JOIN metric ON metric.path = members.path
      WHERE ${input.tagId ? Prisma.sql`(tag.id = ${input.tagId} OR tag."publicId" = ${input.tagId})` : Prisma.sql`TRUE`}
      GROUP BY tag.id
      ORDER BY tag.name ASC
      LIMIT 500
    `,
  };
}
