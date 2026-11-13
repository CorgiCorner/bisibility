import { Prisma } from "@/lib/generated/prisma/client";
import type { CompareMetricId } from "./compare-model";
import { canonicalPagePathSql } from "./page-path";

export type CompareMetricQuery = {
  changedTagId: string;
  from: Date;
  ga4Property: string | null;
  gscProperty: string | null;
  host: string;
  metric: CompareMetricId;
  projectId: string;
  to: Date;
  unchangedTagId: string;
};

function metricCte(input: CompareMetricQuery) {
  if ((input.metric === "clicks" || input.metric === "impressions") && input.gscProperty) {
    const value =
      input.metric === "impressions" ? Prisma.sql`daily.impressions` : Prisma.sql`daily.clicks`;
    return Prisma.sql`metric AS (
      SELECT day, path, SUM(value)::int AS value
      FROM (
        SELECT daily.date::date AS day,
          ${canonicalPagePathSql(Prisma.sql`daily.page`, input.host)} AS path,
          ${value} AS value
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
  if (input.metric === "sessions" && input.ga4Property) {
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
  return Prisma.sql`metric AS (
    SELECT NULL::date AS day, NULL::text AS path, NULL::int AS value WHERE false
  )`;
}

function grouped(input: CompareMetricQuery) {
  return Prisma.sql`
    WITH tagged AS (
      SELECT page.path, tag."publicId" AS tag_id
      FROM "project_pages" page
      JOIN "page_tags" link ON link."pageId" = page.id
      JOIN "tags" tag ON tag.id = link."tagId"
      WHERE page."projectId" = ${input.projectId}
        AND tag."publicId" IN (${input.changedTagId}, ${input.unchangedTagId})
    ),
    overlap AS (
      SELECT path FROM tagged GROUP BY path HAVING COUNT(DISTINCT tag_id) > 1
    ),
    groups AS (
      SELECT tagged.path, tagged.tag_id
      FROM tagged
      WHERE NOT EXISTS (SELECT 1 FROM overlap WHERE overlap.path = tagged.path)
    ),
    ${metricCte(input)}
  `;
}

export function compareGroupQueries(input: CompareMetricQuery) {
  const withGroups = grouped(input);
  return {
    counts: Prisma.sql`
      ${withGroups}
      SELECT
        (SELECT COUNT(*) FROM groups WHERE tag_id = ${input.changedTagId})::int AS changed,
        (SELECT COUNT(*) FROM overlap)::int AS overlap,
        (SELECT COUNT(*) FROM groups WHERE tag_id = ${input.unchangedTagId})::int AS unchanged
    `,
    daily: Prisma.sql`
      ${withGroups}
      SELECT metric.day::text AS day, groups.tag_id AS "tagId", SUM(metric.value)::int AS value
      FROM groups
      JOIN metric ON metric.path = groups.path
      GROUP BY metric.day, groups.tag_id
      ORDER BY metric.day
    `,
  };
}
